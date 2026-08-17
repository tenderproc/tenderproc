/** Exercises the real @paddle/paddle-node-sdk signature verification (no
 * mocking — it's pure local HMAC, no network call), so we're testing our
 * actual dependency's behavior, not an assumption about it. Confirms the
 * one rule that matters most here: an unverified/tampered payload is
 * never accepted. */
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { subscriptionCreatedPayload } from "./fixtures";

const SECRET = "pdl_ntfset_test_secret_1234567890";

function sign(body: string, secret: string, ts = Math.floor(Date.now() / 1000)) {
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

describe("Paddle webhook signature verification", () => {
  beforeAll(() => {
    process.env.PADDLE_API_KEY = "test_api_key";
    process.env.PADDLE_WEBHOOK_SECRET = SECRET;
  });

  it("accepts a genuinely valid signature and parses a typed event out of it", async () => {
    const { unmarshalWebhook } = await import("@/lib/billing/paddle");
    const body = JSON.stringify(subscriptionCreatedPayload());
    const event = await unmarshalWebhook(body, sign(body, SECRET));
    expect(event.eventId).toBe("evt_01hv8x2acma2gz7he8kg2s0hna");
    expect(event.eventType).toBe("subscription.created");
  });

  it("rejects a tampered body signed for a different payload", async () => {
    const { unmarshalWebhook } = await import("@/lib/billing/paddle");
    const original = JSON.stringify(subscriptionCreatedPayload());
    const validSigForOriginal = sign(original, SECRET);
    const tampered = JSON.stringify(subscriptionCreatedPayload({ event_type: "subscription.canceled" }));

    await expect(unmarshalWebhook(tampered, validSigForOriginal)).rejects.toThrow(/signature/i);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const { unmarshalWebhook } = await import("@/lib/billing/paddle");
    const body = JSON.stringify(subscriptionCreatedPayload());
    await expect(unmarshalWebhook(body, sign(body, "not-the-real-secret"))).rejects.toThrow(/signature/i);
  });

  it("rejects a timestamp older than the configured tolerance (replay protection)", async () => {
    const { unmarshalWebhook } = await import("@/lib/billing/paddle");
    const body = JSON.stringify(subscriptionCreatedPayload());
    const oldTs = Math.floor(Date.now() / 1000) - 400; // older than the 300s default tolerance
    await expect(unmarshalWebhook(body, sign(body, SECRET, oldTs))).rejects.toThrow(/signature/i);
  });

  it("accepts a signature within the tolerance window even if a few seconds old", async () => {
    // Real Paddle deliveries regularly carry >5s of dispatch latency before
    // this route even sees them — this is the case the SDK's own hardcoded
    // 5s window used to reject outright. See the comment on
    // unmarshalWebhook in lib/billing/paddle.ts.
    const { unmarshalWebhook } = await import("@/lib/billing/paddle");
    const body = JSON.stringify(subscriptionCreatedPayload());
    const slightlyOldTs = Math.floor(Date.now() / 1000) - 60;
    const event = await unmarshalWebhook(body, sign(body, SECRET, slightlyOldTs));
    expect(event.eventType).toBe("subscription.created");
  });
});
