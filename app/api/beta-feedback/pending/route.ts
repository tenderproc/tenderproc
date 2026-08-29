import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDueMilestone, getConfirmedRedemption } from "@/lib/billing/betaPromo";

export const dynamic = "force-dynamic";

/** Polled by BetaFeedbackModal on mount. Returns `{ due: null }` for
 * anyone who isn't a confirmed beta-promo subscriber, or who is but has no
 * milestone currently due — the modal renders nothing in either case, so
 * this route is safe to call unconditionally for every signed-in user. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ due: null });

  const admin = createAdminClient();
  const redemption = await getConfirmedRedemption(admin, user.id);
  if (!redemption || !redemption.confirmed_at) return NextResponse.json({ due: null });

  const { data: responses, error } = await admin
    .from("beta_feedback_responses")
    .select("milestone")
    .eq("redemption_id", redemption.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = computeDueMilestone({
    confirmedAt: new Date(redemption.confirmed_at),
    now: new Date(),
    respondedMilestones: (responses ?? []).map((r) => r.milestone as number),
  });

  return NextResponse.json({ due, redemptionId: due ? redemption.id : undefined });
}
