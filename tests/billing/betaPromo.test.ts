import { beforeEach, describe, expect, it } from "vitest";

describe("computeDueMilestone", () => {
  it("returns null before day 7", async () => {
    const { computeDueMilestone } = await import("@/lib/billing/betaPromo");
    const due = computeDueMilestone({
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-05T00:00:00Z"),
      respondedMilestones: [],
    });
    expect(due).toBeNull();
  });

  it("returns 7 once day 7 is crossed and unanswered", async () => {
    const { computeDueMilestone } = await import("@/lib/billing/betaPromo");
    const due = computeDueMilestone({
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-08T00:00:00Z"),
      respondedMilestones: [],
    });
    expect(due).toBe(7);
  });

  it("skips a milestone that already has a response (submitted or dismissed)", async () => {
    const { computeDueMilestone } = await import("@/lib/billing/betaPromo");
    const due = computeDueMilestone({
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-01-08T00:00:00Z"),
      respondedMilestones: [7],
    });
    expect(due).toBeNull();
  });

  it("surfaces the earliest un-answered crossed milestone, not the latest — one prompt at a time", async () => {
    const { computeDueMilestone } = await import("@/lib/billing/betaPromo");
    // Day 90+ has passed with day 7 never answered — should still ask about
    // day 7 first, not jump straight to day 90.
    const due = computeDueMilestone({
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-05-01T00:00:00Z"),
      respondedMilestones: [],
    });
    expect(due).toBe(7);
  });

  it("moves on to day 30 once day 7 has a response", async () => {
    const { computeDueMilestone } = await import("@/lib/billing/betaPromo");
    const due = computeDueMilestone({
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-02-01T00:00:00Z"),
      respondedMilestones: [7],
    });
    expect(due).toBe(30);
  });

  it("returns null once all three milestones have responses", async () => {
    const { computeDueMilestone } = await import("@/lib/billing/betaPromo");
    const due = computeDueMilestone({
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
      now: new Date("2026-05-01T00:00:00Z"),
      respondedMilestones: [7, 30, 90],
    });
    expect(due).toBeNull();
  });
});

describe("computePromoEndDate", () => {
  it("adds exactly 6 calendar months", async () => {
    const { computePromoEndDate } = await import("@/lib/billing/betaPromo");
    const end = computePromoEndDate(new Date("2026-01-15T10:00:00Z"));
    expect(end.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });
});

describe("isBetaPromoDiscount", () => {
  beforeEach(() => {
    process.env.PADDLE_BETA_PROMO_DISCOUNT_ID = "dsc_beta20";
  });

  it("matches the configured discount id", async () => {
    const { isBetaPromoDiscount } = await import("@/lib/billing/betaPromo");
    expect(isBetaPromoDiscount("dsc_beta20")).toBe(true);
  });

  it("rejects a different discount id", async () => {
    const { isBetaPromoDiscount } = await import("@/lib/billing/betaPromo");
    expect(isBetaPromoDiscount("dsc_other")).toBe(false);
  });

  it("rejects null/undefined (subscription has no discount at all)", async () => {
    const { isBetaPromoDiscount } = await import("@/lib/billing/betaPromo");
    expect(isBetaPromoDiscount(null)).toBe(false);
    expect(isBetaPromoDiscount(undefined)).toBe(false);
  });
});
