/**
 * Browser-only Paddle.js instance. Only ever import this from "use client"
 * components — it downloads and initializes Paddle's checkout script.
 */
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { PADDLE_CLIENT_TOKEN, PADDLE_ENV } from "@/lib/paddle";

let paddlePromise: Promise<Paddle | undefined> | null = null;
let paddlePromisePwCustomerId: string | undefined;

/** Lazily initializes Paddle.js once and caches the instance across every
 * caller on the page — re-running initializePaddle() on each click would
 * re-download the script and risk duplicate checkout overlays. Re-initializes
 * only if `pwCustomerId` actually changes (e.g. the signed-in user's Paddle
 * customer id resolves after an earlier call was made without one).
 *
 * `pwCustomerId` powers Paddle Retain (dunning/win-back messaging) — it must
 * be the *Paddle* customer id (e.g. "ctm_...", from `subscriptions.paddle_customer_id`),
 * never our internal Supabase user id or the customer's email. Omit it
 * entirely for visitors with no Paddle customer yet (Free tier, pre-checkout). */
export function getPaddleClient(pwCustomerId?: string): Promise<Paddle | undefined> {
  if (!paddlePromise || paddlePromisePwCustomerId !== pwCustomerId) {
    paddlePromisePwCustomerId = pwCustomerId;
    paddlePromise = initializePaddle({
      token: PADDLE_CLIENT_TOKEN,
      environment: PADDLE_ENV,
      ...(pwCustomerId ? { pwCustomer: { id: pwCustomerId } } : {}),
    });
  }
  return paddlePromise;
}
