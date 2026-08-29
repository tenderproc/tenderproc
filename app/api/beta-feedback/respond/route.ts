import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfirmedRedemption, FEEDBACK_MILESTONES } from "@/lib/billing/betaPromo";

export const dynamic = "force-dynamic";

/** Records a submitted answer or a dismissal for one milestone — either way
 * a row is written, so /pending never asks about this milestone again (see
 * computeDueMilestone). Ownership is enforced by looking the redemption up
 * for the *authenticated* user rather than trusting a redemptionId the
 * client sends. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json();
  const milestone = body.milestone;
  if (!FEEDBACK_MILESTONES.includes(milestone)) {
    return NextResponse.json({ error: "Invalid milestone." }, { status: 400 });
  }
  const dismissed = Boolean(body.dismissed);
  const rating = typeof body.rating === "number" ? body.rating : null;
  const comments = typeof body.comments === "string" ? body.comments.slice(0, 4000) : null;

  const admin = createAdminClient();
  const redemption = await getConfirmedRedemption(admin, user.id);
  if (!redemption) {
    return NextResponse.json({ error: "No confirmed beta promo redemption for this user." }, { status: 404 });
  }

  const { error } = await admin.from("beta_feedback_responses").upsert(
    {
      redemption_id: redemption.id,
      user_id: user.id,
      milestone,
      rating: dismissed ? null : rating,
      comments: dismissed ? null : comments,
      dismissed,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "redemption_id,milestone" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
