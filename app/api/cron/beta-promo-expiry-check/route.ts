import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaddleClient } from "@/lib/billing/paddle";
import { sendAdminAlertEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Monitoring-only safety net (see vercel.json) — Paddle's discount itself
 * has `recur: true` + `maximumRecurringIntervals: 6`, so it auto-expires
 * the beta promo's 50% off on its own; this job doesn't touch billing. It
 * just checks that Paddle actually did drop the discount on schedule, and
 * flags (logs + emails ADMIN_EMAILS) any confirmed redemption past its
 * promo_end_date whose live Paddle subscription still shows a discount —
 * which would mean either Paddle's auto-expiry didn't fire as expected, or
 * the subscriber is somehow back on a discount after resubscribing (which
 * reserveBetaPromoSlot's per-user "confirmed" check should already prevent
 * at signup time, so seeing this here would point at a gap there).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: expired, error } = await supabase
    .from("beta_promo_redemptions")
    .select("id, user_id, paddle_subscription_id, promo_end_date")
    .eq("status", "confirmed")
    .lt("promo_end_date", nowIso);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const paddle = getPaddleClient();
  const flagged: string[] = [];
  const errors: string[] = [];

  for (const row of expired ?? []) {
    const subscriptionId = row.paddle_subscription_id as string | null;
    if (!subscriptionId) continue;
    try {
      const subscription = await paddle.subscriptions.get(subscriptionId);
      if (subscription.discount) {
        flagged.push(
          `redemption ${row.id} (user ${row.user_id}, subscription ${subscriptionId}) — promo_end_date ` +
            `${row.promo_end_date} has passed but Paddle still reports discount ${subscription.discount.id}`
        );
      }
    } catch (err) {
      errors.push(`${subscriptionId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (flagged.length > 0) {
    console.error("[beta-promo-expiry-check] discount still active past promo_end_date:", flagged);
    await sendAdminAlertEmail("Beta promo discount didn't expire on schedule", flagged);
  }

  return NextResponse.json({ checked: expired?.length ?? 0, flagged, errors });
}
