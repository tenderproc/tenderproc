import { describe, expect, it } from "vitest";
import { FEATURES, FREE_SECTOR_LIMIT, getEffectiveTier, hasFeature } from "@/lib/billing/tiers";
import type { UserSubscription } from "@/lib/billing/types";

function sub(overrides: Partial<UserSubscription>): UserSubscription {
  return {
    tier: "PRO",
    status: "active",
    paddleCustomerId: "ctm_1",
    paddleSubscriptionId: "sub_1",
    currentPeriodEnd: null,
    gracePeriodEndsAt: null,
    canceledAt: null,
    ...overrides,
  };
}

describe("getEffectiveTier", () => {
  it("active subscription keeps its tier", () => {
    const result = getEffectiveTier(sub({ tier: "PREMIUM", status: "active" }));
    expect(result).toEqual({ tier: "PREMIUM", status: "active", inGracePeriod: false });
  });

  it("past_due within the grace window keeps the paid tier and flags inGracePeriod", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const result = getEffectiveTier(
      sub({ tier: "PRO", status: "past_due", gracePeriodEndsAt: "2026-01-15T00:00:00Z" }),
      now
    );
    expect(result).toEqual({ tier: "PRO", status: "past_due", inGracePeriod: true });
  });

  it("past_due after the grace window has elapsed drops to FREE even without a downgrade webhook yet", () => {
    const now = new Date("2026-01-20T00:00:00Z");
    const result = getEffectiveTier(
      sub({ tier: "PRO", status: "past_due", gracePeriodEndsAt: "2026-01-15T00:00:00Z" }),
      now
    );
    expect(result).toEqual({ tier: "FREE", status: "past_due", inGracePeriod: false });
  });

  it("past_due with no grace_period_ends_at set at all is treated as expired, not indefinitely granted", () => {
    const result = getEffectiveTier(sub({ tier: "PRO", status: "past_due", gracePeriodEndsAt: null }));
    expect(result.tier).toBe("FREE");
    expect(result.inGracePeriod).toBe(false);
  });

  it("canceled subscription is FREE regardless of stored tier", () => {
    const result = getEffectiveTier(sub({ tier: "PREMIUM", status: "canceled" }));
    expect(result.tier).toBe("FREE");
  });

  it("paused subscription is FREE regardless of stored tier", () => {
    const result = getEffectiveTier(sub({ tier: "PREMIUM", status: "paused" }));
    expect(result.tier).toBe("FREE");
  });

  it("trialing subscription keeps its tier", () => {
    const result = getEffectiveTier(sub({ tier: "PREMIUM", status: "trialing" }));
    expect(result).toEqual({ tier: "PREMIUM", status: "trialing", inGracePeriod: false });
  });
});

describe("hasFeature", () => {
  it("MARKET_OVERVIEW is Premium-only, per /pricing", () => {
    expect(hasFeature("FREE", FEATURES.MARKET_OVERVIEW)).toBe(false);
    expect(hasFeature("PRO", FEATURES.MARKET_OVERVIEW)).toBe(false);
    expect(hasFeature("PREMIUM", FEATURES.MARKET_OVERVIEW)).toBe(true);
  });

  it("BID_WORKSPACE (the Workflow board) is Pro and up, per /pricing", () => {
    expect(hasFeature("FREE", FEATURES.BID_WORKSPACE)).toBe(false);
    expect(hasFeature("PRO", FEATURES.BID_WORKSPACE)).toBe(true);
    expect(hasFeature("PREMIUM", FEATURES.BID_WORKSPACE)).toBe(true);
  });
});

describe("FREE_SECTOR_LIMIT", () => {
  it("matches /pricing's \"Opportunities feed for 1 sector\"", () => {
    expect(FREE_SECTOR_LIMIT).toBe(1);
  });
});
