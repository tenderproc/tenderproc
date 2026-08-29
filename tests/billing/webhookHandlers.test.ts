import { beforeAll, describe, expect, it } from "vitest";
import { FakeSupabase } from "./fakeSupabase";
import type { UserSubscription } from "@/lib/billing/types";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function subscriptionEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    status: "active",
    customerId: "ctm_123",
    customData: { supabase_user_id: USER_ID },
    canceledAt: null,
    currentBillingPeriod: { endsAt: "2026-02-01T00:00:00Z" },
    items: [{ price: { id: "pri_pro" } }],
    ...overrides,
  };
}

beforeAll(() => {
  process.env.PADDLE_PRICE_ID_PRO = "pri_pro";
  process.env.PADDLE_PRICE_ID_PREMIUM = "pri_premium";
  process.env.BILLING_GRACE_PERIOD_DAYS = "7";
});

describe("applySubscriptionEvent — subscription.created / .updated (renewal, plan change)", () => {
  it("subscription.created writes a new PRO subscription row", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase();

    const result = await applySubscriptionEvent(supabase, subscriptionEvent());

    expect(result.applied).toBe(true);
    const row = supabase.tables.subscriptions.rows[0];
    expect(row).toMatchObject({
      user_id: USER_ID,
      tier: "PRO",
      status: "active",
      paddle_customer_id: "ctm_123",
      paddle_subscription_id: "sub_123",
    });
  });

  it("subscription.updated with a renewal just refreshes current_period_end", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase();
    await applySubscriptionEvent(supabase, subscriptionEvent());

    await applySubscriptionEvent(
      supabase,
      subscriptionEvent({ currentBillingPeriod: { endsAt: "2026-03-01T00:00:00Z" } })
    );

    const row = supabase.tables.subscriptions.rows[0];
    expect(row.current_period_end).toBe("2026-03-01T00:00:00Z");
    expect(row.tier).toBe("PRO");
  });

  it("plan change (Pro→Premium) updates tier from the new price id", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase();
    await applySubscriptionEvent(supabase, subscriptionEvent());

    await applySubscriptionEvent(supabase, subscriptionEvent({ items: [{ price: { id: "pri_premium" } }] }));

    expect(supabase.tables.subscriptions.rows[0].tier).toBe("PREMIUM");
  });

  it("downgrade (Premium→Pro) updates tier the same way — access-level consequences are getEffectiveTier's job, not this handler's", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase();
    await applySubscriptionEvent(supabase, subscriptionEvent({ items: [{ price: { id: "pri_premium" } }] }));

    await applySubscriptionEvent(supabase, subscriptionEvent({ items: [{ price: { id: "pri_pro" } }] }));

    expect(supabase.tables.subscriptions.rows[0].tier).toBe("PRO");
  });

  it("skips (does not throw) an event with no supabase_user_id in customData", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase();

    const result = await applySubscriptionEvent(supabase, subscriptionEvent({ customData: null }));

    expect(result.applied).toBe(false);
    expect(supabase.tables.subscriptions?.rows ?? []).toHaveLength(0);
  });

  it("skips an unrecognized price id rather than guessing a tier", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase();

    const result = await applySubscriptionEvent(
      supabase,
      subscriptionEvent({ items: [{ price: { id: "pri_unknown" } }] })
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toMatch(/does not map to a known tier/);
  });
});

describe("applySubscriptionEvent — subscription.past_due (grace period)", () => {
  it("first past_due starts a grace-period clock BILLING_GRACE_PERIOD_DAYS out", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase();
    await applySubscriptionEvent(supabase, subscriptionEvent());

    const now = new Date("2026-01-01T00:00:00Z");
    await applySubscriptionEvent(supabase, subscriptionEvent({ status: "past_due" }), now);

    const row = supabase.tables.subscriptions.rows[0];
    expect(row.status).toBe("past_due");
    expect(row.grace_period_ends_at).toBe("2026-01-08T00:00:00.000Z");
    expect(row.tier).toBe("PRO"); // still PRO — grace period means access isn't cut yet
  });

  it("a retry webhook while still past_due does NOT push the deadline back out", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase();
    await applySubscriptionEvent(supabase, subscriptionEvent());
    await applySubscriptionEvent(
      supabase,
      subscriptionEvent({ status: "past_due" }),
      new Date("2026-01-01T00:00:00Z")
    );

    // Paddle retries the charge a few days later, still failing — this
    // must NOT reset the grace clock to 7 more days from now.
    await applySubscriptionEvent(
      supabase,
      subscriptionEvent({ status: "past_due" }),
      new Date("2026-01-05T00:00:00Z")
    );

    expect(supabase.tables.subscriptions.rows[0].grace_period_ends_at).toBe("2026-01-08T00:00:00.000Z");
  });

  it("recovering (past_due → active) clears the grace period", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase();
    await applySubscriptionEvent(supabase, subscriptionEvent());
    await applySubscriptionEvent(supabase, subscriptionEvent({ status: "past_due" }));

    await applySubscriptionEvent(supabase, subscriptionEvent({ status: "active" }));

    const row = supabase.tables.subscriptions.rows[0];
    expect(row.status).toBe("active");
    expect(row.grace_period_ends_at).toBeNull();
  });
});

describe("applySubscriptionEvent — subscription.canceled", () => {
  it("records status=canceled; the stored tier is left as-is for record-keeping (getEffectiveTier resolves access to FREE)", async () => {
    const { applySubscriptionEvent } = await import("@/lib/billing/webhookHandlers");
    const { getEffectiveTier } = await import("@/lib/billing/tiers");
    const supabase = new FakeSupabase();
    await applySubscriptionEvent(supabase, subscriptionEvent({ items: [{ price: { id: "pri_premium" } }] }));

    await applySubscriptionEvent(
      supabase,
      subscriptionEvent({ status: "canceled", canceledAt: "2026-01-10T00:00:00Z" })
    );

    const row = supabase.tables.subscriptions.rows[0];
    expect(row.status).toBe("canceled");
    expect(row.canceled_at).toBe("2026-01-10T00:00:00Z");
    const effective = getEffectiveTier({
      tier: row.tier as UserSubscription["tier"],
      status: row.status as UserSubscription["status"],
      paddleCustomerId: row.paddle_customer_id as string | null,
      paddleSubscriptionId: row.paddle_subscription_id as string | null,
      currentPeriodEnd: row.current_period_end as string | null,
      gracePeriodEndsAt: row.grace_period_ends_at as string | null,
      canceledAt: row.canceled_at as string | null,
    });
    expect(effective.tier).toBe("FREE");
  });
});

describe("logWebhookEvent — durable audit log, including retries", () => {
  it("logs a fresh event and returns its row id", async () => {
    const { logWebhookEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase({ billing_webhook_events: ["paddle_event_id"] });

    const { rowId, isDuplicate } = await logWebhookEvent(supabase, {
      eventId: "evt_1",
      eventType: "subscription.created",
      data: { id: "sub_1" },
    });

    expect(isDuplicate).toBe(false);
    expect(rowId).not.toBeNull();
    expect(supabase.tables.billing_webhook_events.rows[0].payload).toEqual({ id: "sub_1" });
  });

  it("a retried delivery of the same event_id is logged once and reported as a duplicate", async () => {
    const { logWebhookEvent } = await import("@/lib/billing/webhookHandlers");
    const supabase = new FakeSupabase({ billing_webhook_events: ["paddle_event_id"] });
    const event = { eventId: "evt_dup", eventType: "subscription.created", data: {} };

    await logWebhookEvent(supabase, event);
    const second = await logWebhookEvent(supabase, event);

    expect(second.isDuplicate).toBe(true);
    expect(second.rowId).toBeNull();
    expect(supabase.tables.billing_webhook_events.rows).toHaveLength(1);
  });
});
