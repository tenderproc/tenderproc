import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchBelgianTenders } from "@/lib/ted";
import { sectorsToCpvPrefixes } from "@/lib/sectors";
import { sendNewTendersEmail, CompanyFollowMatchEmailItem } from "@/lib/email";
import { TenderNotice } from "@/lib/types";

export const dynamic = "force-dynamic";

interface EmbeddedContractAward {
  contracting_authority: string;
  award_date: string | null;
  source_url: string;
}

/**
 * Daily check (see vercel.json) for tenders newly published in each user's
 * saved sectors, plus (Feature 2, "Company Following") any followed
 * company that newly won an award since the last run. A user's first-ever
 * tender run only records a baseline (no email) so signing up doesn't dump
 * every historical match into their inbox — company-follow matches have no
 * equivalent backlog risk (app/api/cron/ingest-awards only matches each
 * day's newly-upserted batch), so they're always emailed as soon as
 * they're pending. Both are combined into one email per user when both are
 * present (lib/email.ts's sendNewTendersEmail).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Sectors now come from companies.sector_keys, the same source
  // Opportunities/matching reads (see lib/companyProfile.ts) — this used
  // to read profiles.sectors directly and would have drifted stale once
  // that stopped being the source of truth. `language` stays a separate
  // profiles-only preference (unrelated to matching), joined in below by
  // user id since companies/profiles have no direct FK relationship for
  // PostgREST to embed.
  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("user_id, sector_keys");
  if (companiesError) {
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }
  const { data: profileLanguages, error: profilesError } = await supabase
    .from("profiles")
    .select("id, language");
  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }
  const languageByUserId = new Map((profileLanguages ?? []).map((p) => [p.id as string, p.language as string | null]));
  const profiles = (companies ?? []).map((c) => ({
    id: c.user_id as string,
    sectors: (c.sector_keys as string[] | null) ?? [],
    languages: languageByUserId.get(c.user_id as string) ? [languageByUserId.get(c.user_id as string) as string] : [],
  }));

  const { data: pendingMatches, error: matchesError } = await supabase
    .from("company_follow_matches")
    .select(
      "id, user_id, followed_company_name, contract_awards(contracting_authority, award_date, source_url)"
    )
    .is("emailed_at", null);
  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 500 });
  }

  const matchesByUser = new Map<string, { matchIds: string[]; items: CompanyFollowMatchEmailItem[] }>();
  for (const m of pendingMatches ?? []) {
    const award = m.contract_awards as unknown as EmbeddedContractAward | null;
    if (!award) continue; // the award row is gone — nothing left to report
    const entry = matchesByUser.get(m.user_id as string) ?? { matchIds: [], items: [] };
    entry.matchIds.push(m.id as string);
    entry.items.push({
      companyName: m.followed_company_name as string,
      contractingAuthority: award.contracting_authority,
      awardDate: award.award_date,
      url: award.source_url,
    });
    matchesByUser.set(m.user_id as string, entry);
  }

  const withSectors = (profiles ?? []).filter((p) => (p.sectors?.length ?? 0) > 0);
  const userIds = new Set<string>([...withSectors.map((p) => p.id as string), ...matchesByUser.keys()]);

  let usersChecked = 0;
  let emailsSent = 0;
  let bootstrapped = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      usersChecked++;
      const profile = withSectors.find((p) => p.id === userId);

      let newTenders: TenderNotice[] = [];
      let isFirstRun = false;
      if (profile) {
        const cpvPrefixes = sectorsToCpvPrefixes(profile.sectors);
        const languageKeys = profile.languages?.length ? profile.languages : undefined;
        const tenders = await searchBelgianTenders({ cpvPrefixes, languageKeys, limit: 50 });

        const { data: seen, error: seenError } = await supabase
          .from("notified_tenders")
          .select("publication_number")
          .eq("user_id", userId);
        if (seenError) throw new Error(seenError.message);

        const seenSet = new Set((seen ?? []).map((r) => r.publication_number));
        isFirstRun = (seen?.length ?? 0) === 0;
        newTenders = tenders.filter((t) => !seenSet.has(t.publicationNumber));
      }

      const companyMatchEntry = matchesByUser.get(userId);
      const companyMatches = companyMatchEntry?.items ?? [];

      const tendersToEmail = isFirstRun ? [] : newTenders;
      if (isFirstRun && newTenders.length > 0) bootstrapped++;

      // Send (or skip, for a tender-bootstrap run with no pending company
      // matches) *before* recording the dedup rows below — if the send
      // throws, we don't want to have already marked these as
      // notified/emailed, or they'd never be retried on the next run.
      if (tendersToEmail.length > 0 || companyMatches.length > 0) {
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
        if (userError) throw new Error(userError.message);
        const email = userData.user?.email;
        if (email) {
          await sendNewTendersEmail(email, tendersToEmail, companyMatches);
          emailsSent++;
        }
      }

      if (newTenders.length > 0) {
        const { error: insertError } = await supabase.from("notified_tenders").insert(
          newTenders.map((t) => ({
            user_id: userId,
            publication_number: t.publicationNumber,
          }))
        );
        if (insertError) throw new Error(insertError.message);
      }

      if (companyMatchEntry && companyMatchEntry.matchIds.length > 0) {
        const { error: stampError } = await supabase
          .from("company_follow_matches")
          .update({ emailed_at: new Date().toISOString() })
          .in("id", companyMatchEntry.matchIds);
        if (stampError) throw new Error(stampError.message);
      }
    } catch (err) {
      errors.push(`${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    usersChecked,
    bootstrapped,
    emailsSent,
    errors,
  });
}
