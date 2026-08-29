import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unmarshalWebhook } from "@/lib/billing/paddle";
import { clientIpFromHeaders, isAllowedPaddleWebhookIp } from "@/lib/billing/paddleIpAllowlist";
import {
  applySubscriptionEvent,
  logWebhookEvent,
  markEventProcessed,
  resolveSupabaseUserId,
  SUBSCRIPTION_EVENT_TYPES,
  type SubscriptionEventData,
  type SupabaseLike,
} from "@/lib/billing/webhookHandlers";
import { confirmBetaPromoRedemption, isBetaPromoDiscount } from "@/lib/billing/betaPromo";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Paddle webhook endpoint. Order of operations is deliberate and must not
 * change:
 *   0. Reject any delivery not sourced from one of Paddle's own published
 *      IPs (api.paddle.com/ips or sandbox-api.paddle.com/ips, per
 *      PADDLE_ENV — see lib/billing/paddleIpAllowlist.ts). A second,
 *      independent gate in front of signature verification, not a
 *      replacement for it.
 *   1. Verify the signature against the RAW body (never parse-then-verify —
 *      that would let a tampered payload through as long as it re-serializes
 *      to something the SDK re-signs internally, which is not how HMAC
 *      verification works, but keeping raw-body-first is the safe habit).
 *   2. Log the event before acting on it, so a crash mid-processing still
 *      leaves a record of what arrived.
 *   3. Dispatch by event type. Unrecognized/unhandled types are logged and
 *      acknowledged (200), not treated as errors — Paddle sends many event
 *      types we don't act on (price.updated, discount.created, ...).
 */
export async function POST(req: NextRequest) {
  const clientIp = clientIpFromHeaders(req.headers);
  if (!(await isAllowedPaddleWebhookIp(clientIp))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("paddle-signature");
  const adminClient = createAdminClient();
  // Supabase's generated client type is deep enough that structurally
  // comparing it against SupabaseLike trips TS's recursion limit
  // (TS2589) — the two are compatible in practice (see
  // tests/billing/webhookHandlers.test.ts, which exercises every method
  // SupabaseLike declares against a fake implementing the same shape);
  // this cast just sidesteps the compiler's depth limit, not a real type hole.
  const supabase = adminClient as unknown as SupabaseLike;

  if (!signature) {
    await logRawFailure(supabase, rawBody, "missing paddle-signature header");
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event;
  try {
    event = await unmarshalWebhook(rawBody, signature);
  } catch (err) {
    // Signature verification failed — never trust this payload. Still log
    // it (as much as we can without a verified event object) so a signing
    // secret misconfiguration is visible in the DB, not just server logs.
    await logRawFailure(supabase, rawBody, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const { rowId, isDuplicate } = await logWebhookEvent(supabase, event);
  if (isDuplicate) {
    // Already processed on an earlier delivery of this same event — Paddle
    // retries are expected; acknowledge without reprocessing.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    if (SUBSCRIPTION_EVENT_TYPES.has(event.eventType)) {
      const subscriptionData = event.data as unknown as SubscriptionEventData;
      const result = await applySubscriptionEvent(supabase, subscriptionData);
      if (rowId) await markEventProcessed(supabase, rowId, result.applied ? undefined : result.reason);

      // Beta feedback promo: if this subscription carries our promo
      // discount, confirm the user's reserved slot now that Paddle has
      // actually applied it — see lib/billing/betaPromo.ts. A no-op for
      // every subscription that isn't on the promo, and idempotent for
      // retried deliveries of the same event.
      if (isBetaPromoDiscount(subscriptionData.discount?.id)) {
        const userId = resolveSupabaseUserId(subscriptionData.customData);
        if (userId) {
          await confirmBetaPromoRedemption(adminClient as unknown as SupabaseClient, {
            userId,
            paddleSubscriptionId: subscriptionData.id,
          });
        }
      }
    } else {
      // Recognized-but-not-acted-on, or entirely unrecognized — either way,
      // logged above is enough; mark processed so it doesn't look stuck.
      if (rowId) await markEventProcessed(supabase, rowId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (rowId) await markEventProcessed(supabase, rowId, message);
    // Signature was valid and the event is durably logged — acknowledge
    // it (200) rather than making Paddle retry forever. Failures surface
    // via billing_webhook_events.processed = false for a human to check,
    // not via retry storms.
    return NextResponse.json({ ok: false, error: message });
  }

  return NextResponse.json({ ok: true });
}

async function logRawFailure(supabase: SupabaseLike, rawBody: string, error: string) {
  let payload: unknown = { raw: rawBody.slice(0, 5000) };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // keep the raw-string fallback above
  }
  await supabase.from("billing_webhook_events").insert({
    event_type: "unknown",
    payload,
    processed: false,
    error,
  });
}
