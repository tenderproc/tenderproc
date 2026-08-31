/**
 * Browser-only Paddle.js instance. Only ever import this from "use client"
 * components — it downloads and initializes Paddle's checkout script.
 */
import { initializePaddle, type Paddle, type PaddleEventData } from "@paddle/paddle-js";
import { PADDLE_CLIENT_TOKEN, PADDLE_ENV } from "@/lib/paddle";

let paddlePromise: Promise<Paddle | undefined> | null = null;
let paddlePromisePwCustomerId: string | undefined;

// Paddle.js only exposes checkout lifecycle events (loaded, error, closed...)
// through one global `eventCallback` set at initializePaddle() time, not per
// Checkout.open() call — so callers subscribe/unsubscribe through this single
// dispatcher instead. Only one checkout overlay is ever open at a time in
// this app, so a single "current listener" slot is enough; a later
// subscriber simply replaces the previous one.
let currentCheckoutListener: ((event: PaddleEventData) => void) | null = null;

/** Subscribes to Paddle checkout events until the returned function is
 * called. Used by UpgradeButton to know when the overlay actually finished
 * loading (or failed/closed) instead of guessing from Checkout.open()'s
 * return, which resolves as soon as the overlay starts opening — not once
 * its assets have actually loaded and it's visible. On a slow connection
 * that gap can be many seconds, during which the triggering button would
 * otherwise silently look inert (see the QA audit's persona 2 finding). */
export function onPaddleCheckoutEvent(listener: (event: PaddleEventData) => void): () => void {
  currentCheckoutListener = listener;
  return () => {
    if (currentCheckoutListener === listener) currentCheckoutListener = null;
  };
}

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
      eventCallback: (event) => currentCheckoutListener?.(event),
      ...(pwCustomerId ? { pwCustomer: { id: pwCustomerId } } : {}),
    });
  }
  return paddlePromise;
}
