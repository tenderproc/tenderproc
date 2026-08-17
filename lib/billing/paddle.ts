/**
 * Thin wrapper around the official @paddle/paddle-node-sdk. Every field
 * name/enum used here was read directly from the SDK's own .d.ts files
 * (node_modules/@paddle/paddle-node-sdk/dist/types/...), not guessed from
 * docs prose.
 */
import { Environment, Paddle } from "@paddle/paddle-node-sdk";
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

/** Verifies the signature and parses the event in one call — never act on
 * a webhook body without going through this first. Throws on an invalid
 * signature (caller must still log the attempt; see the webhook route). */
export async function unmarshalWebhook(rawBody: string, signatureHeader: string) {
  const paddle = getPaddleClient();
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("PADDLE_WEBHOOK_SECRET is not set — see .env.example.");
  }
  return paddle.webhooks.unmarshal(rawBody, secret, signatureHeader);
}
