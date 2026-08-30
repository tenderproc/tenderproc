/**
 * The single source of truth for tier gating. Every feature that needs to
 * check "can this user do X" — including incumbent-screening and
 * forecasting once they exist — should import `hasFeature`/`getUserTier`
 * from here rather than checking `subscriptions.tier` directly or
 * hardcoding a second tier list somewhere else.
 *
 * Gating pattern for downgrade behavior (Premium→Pro, or →Free on
 * cancellation): this module only gates *creating new* tier-gated output.
 * Viewing something already generated is a normal ownership check
 * (`user_id = auth.uid()`) in the feature's own route/query, not a tier
 * check — so a downgraded user keeps read-only access to what they already
 * built, and loses only the ability to create more, without any extra
 * "was this created before I downgraded" bookkeeping.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { EffectiveTier, Tier, UserSubscription } from "./types";

/** Feature keys features gate on. Add to this as real features ship —
 * incumbent-screening and forecasting aren't built yet (see README), so
 * these are the two placeholders those features should adopt rather than
 * inventing their own tier logic. */
export const FEATURES = {
  UNLIMITED_TENDER_UPLOADS: "unlimited_tender_uploads",
  BID_WORKSPACE: "bid_workspace",
  INCUMBENT_SCREENING: "incumbent_screening",
  TENDER_FORECASTING: "tender_forecasting",
  MARKET_OVERVIEW: "market_overview",
} as const;
export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

const TIER_FEATURES: Record<Tier, Set<FeatureKey>> = {
  FREE: new Set([]),
  PRO: new Set([FEATURES.UNLIMITED_TENDER_UPLOADS, FEATURES.BID_WORKSPACE]),
  PREMIUM: new Set([
    FEATURES.UNLIMITED_TENDER_UPLOADS,
    FEATURES.BID_WORKSPACE,
    FEATURES.INCUMBENT_SCREENING,
    FEATURES.TENDER_FORECASTING,
    FEATURES.MARKET_OVERVIEW,
  ]),
};

/** Free tier's Opportunities-feed sector cap ("/pricing": "Opportunities
 * feed for 1 sector"). Not a `FeatureKey` — it's a count, not a
 * present/absent flag, so app/opportunities/page.tsx and app/market/page.tsx
 * apply it directly rather than through `hasFeature`. */
export const FREE_SECTOR_LIMIT = 1;

export function hasFeature(tier: Tier, feature: FeatureKey): boolean {
  return TIER_FEATURES[tier].has(feature);
}

const TIER_RANK: Record<Tier, number> = { FREE: 0, PRO: 1, PREMIUM: 2 };
export function tierAtLeast(tier: Tier, minimum: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[minimum];
}

/** Every column a `subscriptions` row needs for `rowToUserSubscription`.
 * Shared so any caller's own `.select()` (admin or RLS-scoped) stays in
 * sync with what the mapper below actually reads. */
export const SUBSCRIPTION_COLUMNS =
  "tier, status, paddle_customer_id, paddle_subscription_id, current_period_end, grace_period_ends_at, canceled_at";

type SubscriptionRow = {
  tier: string;
  status: string;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  current_period_end: string | null;
  grace_period_ends_at: string | null;
  canceled_at: string | null;
} | null;

/** A user who never subscribed has no `subscriptions` row at all — Free
 * isn't a billing object, per spec — so `row: null` maps to the implicit
 * FREE default rather than being an error case. */
export function rowToUserSubscription(row: SubscriptionRow): UserSubscription {
  if (!row) {
    return {
      tier: "FREE",
      status: "active",
      paddleCustomerId: null,
      paddleSubscriptionId: null,
      currentPeriodEnd: null,
      gracePeriodEndsAt: null,
      canceledAt: null,
    };
  }

  return {
    tier: row.tier as Tier,
    status: row.status as UserSubscription["status"],
    paddleCustomerId: row.paddle_customer_id,
    paddleSubscriptionId: row.paddle_subscription_id,
    currentPeriodEnd: row.current_period_end,
    gracePeriodEndsAt: row.grace_period_ends_at,
    canceledAt: row.canceled_at,
  };
}

/** Admin-privileged lookup by user id — for server-only contexts with no
 * user session of their own to rely on RLS with (webhook processing,
 * future cross-user gating checks). A page rendering the *current* user's
 * own subscription should query via the regular RLS-scoped server client
 * and call `rowToUserSubscription` directly instead of this. */
export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load subscription: ${error.message}`);
  return rowToUserSubscription(data);
}

/** Applies grace-period logic on top of the raw subscription: a user whose
 * payment just failed keeps their paid tier's access until
 * `grace_period_ends_at`, not the instant the first charge fails (per
 * spec). Once that timestamp passes, `getEffectiveTier` returns FREE even
 * if the webhook that should downgrade them hasn't landed yet — access
 * control never depends on a webhook having fired in time. */
export function getEffectiveTier(sub: UserSubscription, now: Date = new Date()): EffectiveTier {
  if (sub.status === "past_due") {
    const graceEnds = sub.gracePeriodEndsAt ? new Date(sub.gracePeriodEndsAt) : null;
    const stillInGrace = graceEnds !== null && now < graceEnds;
    return {
      tier: stillInGrace ? sub.tier : "FREE",
      status: sub.status,
      inGracePeriod: stillInGrace,
    };
  }

  if (sub.status === "canceled" || sub.status === "paused") {
    return { tier: "FREE", status: sub.status, inGracePeriod: false };
  }

  return { tier: sub.tier, status: sub.status, inGracePeriod: false };
}

export async function getUserTier(userId: string): Promise<EffectiveTier> {
  const sub = await getUserSubscription(userId);
  return getEffectiveTier(sub);
}
