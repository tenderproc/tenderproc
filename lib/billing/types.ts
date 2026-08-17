export const TIERS = ["FREE", "PRO", "PREMIUM"] as const;
export type Tier = (typeof TIERS)[number];

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "paused" | "canceled";

export interface UserSubscription {
  tier: Tier;
  status: SubscriptionStatus;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEndsAt: string | null;
  canceledAt: string | null;
}

/** What `getUserTier()` resolves to after applying grace-period logic —
 * this, not `UserSubscription.tier` directly, is what feature gating and
 * the billing page should read. */
export interface EffectiveTier {
  tier: Tier;
  status: SubscriptionStatus;
  /** True while status is 'past_due' but still inside the grace period —
   * the UI should show a "payment failed, update your card" banner even
   * though gating still treats them as `tier`. */
  inGracePeriod: boolean;
}
