import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchBelgianTenders } from "@/lib/ted";
import { sectorsToCpvPrefixes } from "@/lib/sectors";
import { sendNewTendersEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Daily check (see vercel.json) for tenders newly published in each user's
 * saved sectors. A user's first-ever run only records a baseline (no email)
 * so signing up doesn't dump every historical match into their inbox —
 * every run after that emails whatever's new since the last check.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, sectors, languages");

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const withSectors = (profiles ?? []).filter((p) => (p.sectors?.length ?? 0) > 0);

  let usersChecked = 0;
  let emailsSent = 0;
  let bootstrapped = 0;
  const errors: string[] = [];

  for (const profile of withSectors) {
    try {
      usersChecked++;

      const cpvPrefixes = sectorsToCpvPrefixes(profile.sectors);
      const languageKeys = profile.languages?.length ? profile.languages : undefined;
      const tenders = await searchBelgianTenders({ cpvPrefixes, languageKeys, limit: 50 });

      const { data: seen, error: seenError } = await supabase
        .from("notified_tenders")
        .select("publication_number")
        .eq("user_id", profile.id);
      if (seenError) throw new Error(seenError.message);

      const seenSet = new Set((seen ?? []).map((r) => r.publication_number));
      const isFirstRun = (seen?.length ?? 0) === 0;
      const newTenders = tenders.filter((t) => !seenSet.has(t.publicationNumber));

      if (newTenders.length === 0) continue;

      // Send (or skip, on a bootstrap run) *before* recording the dedup
      // rows — if the send throws, we don't want to have already marked
      // these as notified, or they'd never be retried on the next run.
      if (!isFirstRun) {
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
          profile.id
        );
        if (userError) throw new Error(userError.message);
        const email = userData.user?.email;
        if (email) {
          await sendNewTendersEmail(email, newTenders);
          emailsSent++;
        }
      } else {
        bootstrapped++;
      }

      const { error: insertError } = await supabase.from("notified_tenders").insert(
        newTenders.map((t) => ({
          user_id: profile.id,
          publication_number: t.publicationNumber,
        }))
      );
      if (insertError) throw new Error(insertError.message);
    } catch (err) {
      errors.push(`${profile.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    usersChecked,
    bootstrapped,
    emailsSent,
    errors,
  });
}
