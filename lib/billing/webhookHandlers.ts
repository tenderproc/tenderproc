/**
 * Paddle webhook → DB state. Split deliberately into pure decision
 * functions (no I/O, directly unit-testable — see tests/billing/) and thin
 * wrappers that do the actual Supabase reads/writes, so the highest-risk
 * logic (grace periods, tier resolution) can be tested without mocking a
 * database.
 */
import { EventName, tierForPriceId } from "./paddle";
import type { SubscriptionStatus, Tier } from "./types";

/** logWebhookEvent only ever touches these three fields, common to every
 * one of the SDK's ~50 discriminated event subtypes — using the full
 * `EventEntity` union here would force every caller (including tests) to
 * construct a complete, exact-shape payload for one specific event
 * subtype just to log it, which is more than this function needs. */
export interface WebhookEvent {
  eventId: string;
  eventType: string;
  data: unknown;
}

/** The minimal slice of the Supabase client these handlers actually use —
 * deliberately narrower than the full SupabaseClient type. A real
 * SupabaseClient satisfies this structurally (it has all of these methods
 * and more), and it lets tests pass a lightweight in-memory fake without
 * `as any` casts. If a handler needs a query shape this doesn't cover,
 * extend it here rather than widening back to the full client type. */
type Row = Record<string, unknown>;
type DbError = { code?: string; message: string } | null;

export interface SupabaseLike {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: unknown): { maybeSingle(): PromiseLike<{ data: Row | null; error: DbError }> };
    };
    insert(row: Row): PromiseLike<{ error: DbError }> & {
      select(cols?: string): { single(): PromiseLike<{ data: Row | null; error: DbError }> };
    };
    upsert(row: Row, opts: { onConflict: string }): PromiseLike<{ error: DbError }>;
    update(patch: Row): { eq(col: string, val: unknown): PromiseLike<{ error: DbError }> };
  };
  auth: {
    admin: {
      getUserById(id: string): PromiseLike<{ data: { user: { email?: string | null } | null } }>;
    };
  };
}

export const DEFAULT_GRACE_PERIOD_DAYS = Number(process.env.BILLING_GRACE_PERIOD_DAYS ?? 7);

const PADDLE_TO_OUR_STATUS: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  paused: "paused",
  canceled: "canceled",
};

export interface SubscriptionEventData {
  id: string;
  status: string;
  customerId: string;
  customData: Record<string, unknown> | null;
  canceledAt: string | null;
  currentBillingPeriod: { endsAt: string } | null;
  items: { price: { id: string } | null }[];
  /** Non-null while a discount (e.g. the beta feedback promo) is applied —
   * see lib/billing/betaPromo.ts::isBetaPromoDiscount, checked by the
   * webhook route after applySubscriptionEvent to confirm a reserved promo
   * slot. Not used by computeSubscriptionUpsertPlan itself. */
  discount?: { id: string } | null;
}

export interface SubscriptionUpsertPlan {
  user_id: string;
  tier: Tier;
  status: SubscriptionStatus;
  paddle_customer_id: string;
  paddle_subscription_id: string;
  current_period_end: string | null;
  grace_period_ends_at: string | null;
  canceled_at: string | null;
}

/** Only starts a fresh grace-period clock the *first* time a subscription
 * enters past_due — a retry webhook that's still past_due shouldn't push
 * the deadline back out, or a user could stay in grace indefinitely as
 * long as Paddle keeps retrying. Clears the clock the moment status
 * leaves past_due (recovered or fully canceled). */
export function computeGracePeriodEndsAt(params: {
  newStatus: SubscriptionStatus;
  previousGracePeriodEndsAt: string | null;
  now: Date;
  graceDays?: number;
}): string | null {
  const { newStatus, previousGracePeriodEndsAt, now, graceDays = DEFAULT_GRACE_PERIOD_DAYS } = params;
  if (newStatus !== "past_due") return null;
  if (previousGracePeriodEndsAt) return previousGracePeriodEndsAt;
  const ends = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
  return ends.toISOString();
}

/** Resolves who this event is about. Every checkout we create sets
 * customData.supabase_user_id (see createCheckoutTransaction); a
 * subscription with no customData at all means it wasn't created through
 * our checkout flow (e.g. created directly in the Paddle dashboard) and
 * we have nothing to match it to — callers must treat `null` as "log and
 * skip", never guess. */
export function resolveSupabaseUserId(customData: Record<string, unknown> | null): string | null {
  const id = customData?.supabase_user_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function computeSubscriptionUpsertPlan(params: {
  subscription: SubscriptionEventData;
  previousGracePeriodEndsAt: string | null;
  now: Date;
}): SubscriptionUpsertPlan | { skipped: true; reason: string } {
  const { subscription, previousGracePeriodEndsAt, now } = params;

  const userId = resolveSupabaseUserId(subscription.customData);
  if (!userId) {
    return { skipped: true, reason: "no supabase_user_id in customData" };
  }

  const status = PADDLE_TO_OUR_STATUS[subscription.status];
  if (!status) {
    return { skipped: true, reason: `unrecognized Paddle status: ${subscription.status}` };
  }

  const priceId = subscription.items[0]?.price?.id;
  const tier = priceId ? tierForPriceId(priceId) : null;
  if (!tier) {
    return { skipped: true, reason: `price ${priceId ?? "(none)"} does not map to a known tier` };
  }

  return {
    user_id: userId,
    tier,
    status,
    paddle_customer_id: subscription.customerId,
    paddle_subscription_id: subscription.id,
    current_period_end: subscription.currentBillingPeriod?.endsAt ?? null,
    grace_period_ends_at: computeGracePeriodEndsAt({
      newStatus: status,
      previousGracePeriodEndsAt,
      now,
    }),
    canceled_at: subscription.canceledAt,
  };
}

/** Handles SubscriptionCreated/Updated/Activated/Canceled/PastDue/Paused/
 * Resumed/Trialing — they all reduce to "here's the subscription's current
 * state, upsert it." Paddle's own status enum ('active'|'trialing'|
 * 'past_due'|'paused'|'canceled') already matches ours 1:1. */
export async function applySubscriptionEvent(
  supabase: SupabaseLike,
  subscription: SubscriptionEventData,
  now: Date = new Date()
): Promise<{ applied: boolean; reason?: string }> {
  const userId = resolveSupabaseUserId(subscription.customData);
  if (!userId) return { applied: false, reason: "no supabase_user_id in customData" };

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("grace_period_ends_at")
    .eq("user_id", userId)
    .maybeSingle();

  const plan = computeSubscriptionUpsertPlan({
    subscription,
    previousGracePeriodEndsAt: (existing?.grace_period_ends_at as string | undefined) ?? null,
    now,
  });

  if ("skipped" in plan) return { applied: false, reason: plan.reason };

  const { error } = await supabase
    .from("subscriptions")
    .upsert(plan as unknown as Row, { onConflict: "user_id" });
  if (error) throw new Error(`Could not upsert subscription for user ${userId}: ${error.message}`);
  return { applied: true };
}


/** Every event, verified and parsed, before we decide whether to act on it
 * — the audit trail the brief asks for. Returns the inserted row id, or
 * null if this exact Paddle event_id was already logged (webhook
 * retries are expected; we log once and skip reprocessing). */
export async function logWebhookEvent(
  supabase: SupabaseLike,
  event: WebhookEvent
): Promise<{ rowId: string | null; isDuplicate: boolean }> {
  const { data, error } = await supabase
    .from("billing_webhook_events")
    .insert({
      paddle_event_id: event.eventId,
      event_type: event.eventType,
      payload: event.data,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // unique_violation on paddle_event_id — genuine retry, not an error.
      return { rowId: null, isDuplicate: true };
    }
    throw new Error(`Could not log webhook event ${event.eventId}: ${error.message}`);
  }
  if (!data) throw new Error(`Logging webhook event ${event.eventId} returned no row.`);
  return { rowId: data.id as string, isDuplicate: false };
}

export async function markEventProcessed(supabase: SupabaseLike, rowId: string, error?: string) {
  await supabase
    .from("billing_webhook_events")
    .update({ processed: !error, error: error ?? null })
    .eq("id", rowId);
}

export const SUBSCRIPTION_EVENT_TYPES = new Set<string>([
  EventName.SubscriptionCreated,
  EventName.SubscriptionUpdated,
  EventName.SubscriptionActivated,
  EventName.SubscriptionCanceled,
  EventName.SubscriptionPastDue,
  EventName.SubscriptionPaused,
  EventName.SubscriptionResumed,
  EventName.SubscriptionTrialing,
]);
