/**
 * Beta feedback promo: first 20 Pro/Premium subscribers, 50% off for 6
 * months. The 6-month auto-expiry and the 20-redemption cap are enforced by
 * Paddle itself (the discount created by scripts/setup-beta-promo-discount.ts
 * has `recur: true`, `maximumRecurringIntervals: 6`, `usageLimit: 20`) — this
 * module only handles what Paddle's discount object can't: per-customer
 * dedup (Paddle's usage_limit is global-only, no per-customer field exists)
 * and blocking a cancel-then-resubscribe reset, via the
 * beta_promo_redemptions table and its reserve_beta_promo_slot() RPC (see
 * supabase-beta-promo-migration.sql).
 *
 * Split the same way as webhookHandlers.ts: pure decision functions first
 * (unit-testable, no I/O), thin Supabase wrappers after.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tier } from "./types";

const PROMO_MONTHS = 6;
export const FEEDBACK_MILESTONES = [7, 30, 90] as const;
export type FeedbackMilestone = (typeof FEEDBACK_MILESTONES)[number];

export type BetaPromoTier = Extract<Tier, "PRO" | "PREMIUM">;

export function isBetaPromoConfigured(): boolean {
  return Boolean(process.env.PADDLE_BETA_PROMO_DISCOUNT_ID);
}

export function betaPromoDiscountId(): string | null {
  return process.env.PADDLE_BETA_PROMO_DISCOUNT_ID || null;
}

/** Uses UTC month arithmetic deliberately — setMonth() operates on the
 * server process's local timezone, which would make promo_end_date drift
 * by an hour around DST transitions depending on where this happens to
 * run. setUTCMonth keeps the computation deterministic regardless of the
 * server's TZ. */
export function computePromoEndDate(confirmedAt: Date): Date {
  const end = new Date(confirmedAt);
  end.setUTCMonth(end.getUTCMonth() + PROMO_MONTHS);
  return end;
}

/** Which milestone (if any) a redemption confirmed `confirmedAt` is now due
 * for, given which milestones already have a beta_feedback_responses row
 * (submitted OR dismissed — either way, don't ask again). Picks the
 * earliest un-answered crossed threshold, so a user who skipped day 7
 * entirely doesn't get day-7 and day-30 stacked on them at once — they're
 * only ever shown one at a time, oldest first. */
export function computeDueMilestone(params: {
  confirmedAt: Date;
  now: Date;
  respondedMilestones: number[];
}): FeedbackMilestone | null {
  const { confirmedAt, now, respondedMilestones } = params;
  const daysSince = (now.getTime() - confirmedAt.getTime()) / (1000 * 60 * 60 * 24);
  for (const milestone of FEEDBACK_MILESTONES) {
    if (daysSince >= milestone && !respondedMilestones.includes(milestone)) {
      return milestone;
    }
  }
  return null;
}

/** True when a Paddle subscription event's discount matches our beta promo
 * — the webhook's signal that a `reserved` redemption should be confirmed. */
export function isBetaPromoDiscount(discountId: string | null | undefined): boolean {
  const configured = betaPromoDiscountId();
  return Boolean(configured && discountId === configured);
}

export interface BetaPromoStatus {
  active: boolean;
  remaining: number;
}

const TOTAL_SLOTS = 20;

/** Counts confirmed + still-live-reserved redemptions — the same "taken"
 * definition reserve_beta_promo_slot() uses, kept in sync manually since
 * one lives in SQL and the other in a read-only count query. Used by the
 * pricing page banner; reading from our own DB (not Paddle) avoids rate
 * limits and lets the count reflect in-flight reservations immediately. */
export async function getBetaPromoStatus(supabase: SupabaseClient): Promise<BetaPromoStatus> {
  if (!isBetaPromoConfigured()) return { active: false, remaining: 0 };

  const nowIso = new Date().toISOString();
  const { count, error } = await supabase
    .from("beta_promo_redemptions")
    .select("id", { count: "exact", head: true })
    .or(`status.eq.confirmed,and(status.eq.reserved,reservation_expires_at.gte.${nowIso})`);
  if (error) throw new Error(`Could not read beta promo status: ${error.message}`);

  const remaining = Math.max(0, TOTAL_SLOTS - (count ?? 0));
  return { active: remaining > 0, remaining };
}

export type ReserveResult =
  | { ok: true; discountId: string; remaining: number }
  | { ok: false; reason: "already_redeemed" | "promo_full" | "not_configured" };

/** Reserves one of the 20 slots for `userId` via the atomic RPC. Returns a
 * typed result rather than throwing for the two expected rejection cases
 * (already redeemed / promo full) — those are routine "can't offer this
 * user the promo" outcomes the caller falls back on, not errors. */
export async function reserveBetaPromoSlot(
  supabase: SupabaseClient,
  userId: string,
  tier: BetaPromoTier
): Promise<ReserveResult> {
  const discountId = betaPromoDiscountId();
  if (!discountId) return { ok: false, reason: "not_configured" };

  const { data, error } = await supabase
    .rpc("reserve_beta_promo_slot", { p_user_id: userId, p_tier: tier })
    .single();

  if (error) {
    if (error.message.includes("already_redeemed")) return { ok: false, reason: "already_redeemed" };
    if (error.message.includes("promo_full")) return { ok: false, reason: "promo_full" };
    throw new Error(`Could not reserve beta promo slot for user ${userId}: ${error.message}`);
  }

  const row = data as { remaining: number } | null;
  return { ok: true, discountId, remaining: row?.remaining ?? 0 };
}

export interface BetaPromoRedemptionRow {
  id: string;
  user_id: string;
  status: "reserved" | "confirmed" | "expired";
  confirmed_at: string | null;
  promo_end_date: string | null;
  paddle_subscription_id: string | null;
}

export async function getConfirmedRedemption(
  supabase: SupabaseClient,
  userId: string
): Promise<BetaPromoRedemptionRow | null> {
  const { data, error } = await supabase
    .from("beta_promo_redemptions")
    .select("id, user_id, status, confirmed_at, promo_end_date, paddle_subscription_id")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (error) throw new Error(`Could not read beta promo redemption for user ${userId}: ${error.message}`);
  return data as BetaPromoRedemptionRow | null;
}

/** Marks a `reserved` row `confirmed` once the webhook sees the matching
 * discount on a live subscription. Idempotent by construction — the
 * `.eq("status", "reserved")` guard means a retried webhook delivery
 * (already confirmed) just updates zero rows instead of erroring or
 * re-stamping promo_end_date from "now" a second time. */
export async function confirmBetaPromoRedemption(
  supabase: SupabaseClient,
  params: { userId: string; paddleSubscriptionId: string; now?: Date }
): Promise<{ confirmed: boolean }> {
  const now = params.now ?? new Date();
  const { data, error } = await supabase
    .from("beta_promo_redemptions")
    .update({
      status: "confirmed",
      confirmed_at: now.toISOString(),
      promo_end_date: computePromoEndDate(now).toISOString(),
      paddle_subscription_id: params.paddleSubscriptionId,
      paddle_discount_id: betaPromoDiscountId(),
      updated_at: now.toISOString(),
    })
    .eq("user_id", params.userId)
    .eq("status", "reserved")
    .select("id");
  if (error) {
    throw new Error(`Could not confirm beta promo redemption for user ${params.userId}: ${error.message}`);
  }
  return { confirmed: (data?.length ?? 0) > 0 };
}
