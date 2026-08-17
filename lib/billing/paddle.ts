/**
 * Thin wrapper around the official @paddle/paddle-node-sdk. Every field
 * name/enum used here was read directly from the SDK's own .d.ts files
 * (node_modules/@paddle/paddle-node-sdk/dist/types/...), not guessed from
 * docs prose.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Environment, Paddle, Webhooks } from "@paddle/paddle-node-sdk";
import type { Tier } from "./types";

let _client: Paddle | null = null;

export function getPaddleClient(): Paddle {
  if (_client) return _client;
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    throw new Error("PADDLE_API_KEY is not set — see .env.example.");
  }
  _client = new Paddle(apiKey, {
    environment: process.env.PADDLE_ENV === "production" ? Environment.production : Environment.sandbox,
  });
  return _client;
}

/** Paid tiers only — Free has no Paddle price at all (per spec). */
export function priceIdForTier(tier: Exclude<Tier, "FREE">): string {
  const id = tier === "PRO" ? process.env.PADDLE_PRICE_ID_PRO : process.env.PADDLE_PRICE_ID_PREMIUM;
  if (!id) throw new Error(`PADDLE_PRICE_ID_${tier} is not set — see .env.example.`);
  return id;
}

export function tierForPriceId(priceId: string): Exclude<Tier, "FREE"> | null {
  if (priceId === process.env.PADDLE_PRICE_ID_PRO) return "PRO";
  if (priceId === process.env.PADDLE_PRICE_ID_PREMIUM) return "PREMIUM";
  return null;
}

/**
 * Creates a Paddle transaction for the given tier and returns its hosted
 * checkout URL. `customData.supabase_user_id` is how we match the
 * resulting subscription back to our own user record in webhook handlers
 * — every subscription/transaction event carries this custom_data back.
 */
export async function createCheckoutTransaction(params: {
  tier: Exclude<Tier, "FREE">;
  supabaseUserId: string;
  customerEmail: string;
  returnUrl: string;
}) {
  const paddle = getPaddleClient();
  const transaction = await paddle.transactions.create({
    items: [{ priceId: priceIdForTier(params.tier), quantity: 1 }],
    customData: { supabase_user_id: params.supabaseUserId },
    checkout: { url: params.returnUrl },
  });

  const checkoutUrl = transaction.checkout?.url;
  if (!checkoutUrl) {
    throw new Error(
      `Paddle transaction ${transaction.id} was created but returned no checkout URL — check the ` +
        `PADDLE_ENV/default checkout settings in the Paddle dashboard.`
    );
  }
  return { transactionId: transaction.id, checkoutUrl };
}

export async function createCustomerPortalSession(paddleCustomerId: string, subscriptionIds: string[]) {
  const paddle = getPaddleClient();
  const session = await paddle.customerPortalSessions.create(paddleCustomerId, subscriptionIds);
  return session;
}

export { EventName } from "@paddle/paddle-node-sdk";
export type { EventEntity } from "@paddle/paddle-node-sdk";

const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

function signatureToleranceSeconds(): number {
  const raw = process.env.PADDLE_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SIGNATURE_TOLERANCE_SECONDS;
}

/** Verifies the signature and parses the event in one call — never act on
 * a webhook body without going through this first. Throws on an invalid
 * signature (caller must still log the attempt; see the webhook route).
 *
 * This deliberately does NOT call the SDK's own `paddle.webhooks.unmarshal`.
 * That method hardcodes a 5-second freshness window (see
 * WebhooksValidator.MAX_VALID_TIME_DIFFERENCE in
 * node_modules/@paddle/paddle-node-sdk/dist/cjs/notifications/helpers/webhooks-validator.js)
 * with no public way to configure it. In production the gap between a
 * Paddle event's `occurred_at` and this route receiving it is regularly
 * >5s from Paddle's own dispatch latency alone — before Vercel processing
 * time is even counted — so the SDK's tolerance rejects genuine,
 * correctly-signed deliveries outright. We verify the HMAC ourselves,
 * using the exact algorithm Paddle documents (HMAC-SHA256 of
 * `${ts}:${rawBody}`), with a longer, configurable tolerance, then hand
 * the parsed body to the SDK's own `Webhooks.fromJson` for typed parsing
 * — reusing everything except the freshness check. A stale-but-genuine
 * replay is still caught separately by the `paddle_event_id` uniqueness
 * constraint in billing_webhook_events (see logWebhookEvent), so loosening
 * this window doesn't weaken replay protection. */
export async function unmarshalWebhook(rawBody: string, signatureHeader: string) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("PADDLE_WEBHOOK_SECRET is not set — see .env.example.");
  }

  let ts = "";
  let h1 = "";
  for (const part of signatureHeader.split(";")) {
    const [key, value] = part.split("=");
    if (key === "ts" && value) ts = value;
    else if (key === "h1" && value) h1 = value;
  }
  if (!ts || !h1) {
    throw new Error("[Paddle] Invalid webhook signature");
  }

  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(h1, "hex");
  const signatureMatches =
    expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  if (!signatureMatches) {
    throw new Error("[Paddle] Webhook signature verification failed");
  }

  const ageSeconds = Date.now() / 1000 - Number(ts);
  if (ageSeconds > signatureToleranceSeconds()) {
    throw new Error("[Paddle] Webhook signature verification failed");
  }

  return Webhooks.fromJson(JSON.parse(rawBody));
}
