import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBetaFeedbackReminderEmail } from "@/lib/email";
import { FEEDBACK_MILESTONES, type FeedbackMilestone } from "@/lib/billing/betaPromo";

export const dynamic = "force-dynamic";

const SENT_AT_COLUMN: Record<FeedbackMilestone, string> = {
  7: "email_day7_sent_at",
  30: "email_day30_sent_at",
  90: "email_day90_sent_at",
};

/**
 * Daily nudge (see vercel.json) for confirmed beta-promo subscribers who've
 * crossed a day-7/30/90 threshold since confirmed_at and haven't been sent
 * that milestone's reminder yet. One email per crossed-but-unsent milestone
 * per run — a subscriber who somehow skipped a run (e.g. cron was down for
 * a few days) gets each unsent milestone once, not a backlog dump, since
 * every milestone check is independent and idempotent via its own
 * email_dayN_sent_at column.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: redemptions, error } = await supabase
    .from("beta_promo_redemptions")
    .select("id, user_id, confirmed_at, email_day7_sent_at, email_day30_sent_at, email_day90_sent_at")
    .eq("status", "confirmed");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  let emailsSent = 0;
  const errors: string[] = [];

  for (const row of redemptions ?? []) {
    const confirmedAt = row.confirmed_at ? new Date(row.confirmed_at as string).getTime() : null;
    if (!confirmedAt) continue;
    const daysSince = (now - confirmedAt) / (1000 * 60 * 60 * 24);

    for (const milestone of FEEDBACK_MILESTONES) {
      const sentAtCol = SENT_AT_COLUMN[milestone];
      const alreadySent = Boolean(row[sentAtCol as keyof typeof row]);
      if (daysSince < milestone || alreadySent) continue;

      try {
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(row.user_id as string);
        if (userError) throw new Error(userError.message);
        const email = userData.user?.email;
        if (!email) throw new Error("no email on file");

        await sendBetaFeedbackReminderEmail(email, milestone);
        const { error: stampError } = await supabase
          .from("beta_promo_redemptions")
          .update({ [sentAtCol]: new Date().toISOString() })
          .eq("id", row.id as string);
        if (stampError) throw new Error(stampError.message);
        emailsSent++;
      } catch (err) {
        errors.push(`${row.user_id} (day ${milestone}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({ redemptionsChecked: redemptions?.length ?? 0, emailsSent, errors });
}
