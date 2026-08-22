import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContractAwardRecord, fetchHistoricalAwardsPage, resolveIngestionSinceDate } from "@/lib/ted";
import { SECTORS, sectorsToCpvPrefixes } from "@/lib/sectors";
import { computeEstimatedExpiry } from "@/lib/forecast/expiry";
import { getAIProvider } from "@/lib/ai";
import { matchFollowedCompanies } from "@/lib/companies/followMatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How far back to backfill when contract_awards has no rows yet for a
// source. Deliberately narrower than Feature 1's eventual 4-year matching
// lookback (see plan) — smaller footprint to ship, widen later once the
// pipeline is proven.
const AWARD_BACKFILL_MONTHS = 12;

// Leave headroom under maxDuration for the final upsert + response to complete.
const TIME_BUDGET_MS = 50_000;

/**
 * Resolves one TED award into its full contract_awards row, including the
 * Tender Forecast duration/expiry fields. Structured TED fields
 * (parseAwardDuration, via lib/ted.ts) are tried first; only when a notice
 * has no structured duration AND does carry free renewal text does this
 * fall back to a small Anthropic call (a rare path — see the AWARD_FIELDS
 * fill-rate comment in lib/ted.ts). That AI call is best-effort: a failure
 * here must not fail the whole page's ingestion, so it's caught locally and
 * just leaves the award at duration_confidence "unknown" (or "estimated" via
 * the CPV fallback table) rather than aborting the upsert.
 */
async function resolveAwardRow(a: ContractAwardRecord) {
  let explicitDurationMonths = a.duration.explicitDurationMonths;
  const explicitExpiryDate = a.duration.explicitExpiryDate;

  if (explicitDurationMonths == null && explicitExpiryDate == null && a.duration.renewalText) {
    try {
      const extraction = await getAIProvider().extractAwardDuration({
        text: a.duration.renewalText,
        cpvCodes: a.cpvCodes,
      });
      explicitDurationMonths = extraction.months;
    } catch {
      // Leave explicitDurationMonths null — computeEstimatedExpiry below
      // falls through to the CPV table (or "unknown") as normal.
    }
  }

  const forecast = computeEstimatedExpiry({
    awardDate: a.awardDate,
    explicitDurationMonths,
    explicitExpiryDate,
    cpvCodes: a.cpvCodes,
  });

  return {
    source: "ted",
    source_reference: a.sourceReference,
    contracting_authority: a.contractingAuthority,
    cpv_codes: a.cpvCodes,
    award_date: a.awardDate,
    winner_name: a.winnerName,
    winner_country: a.winnerCountry,
    award_value: a.awardValue,
    award_value_currency: a.awardValueCurrency,
    source_url: a.sourceUrl,
    raw_title: a.rawTitle,
    contract_duration_months: forecast.months,
    duration_confidence: forecast.confidence,
    estimated_expiry_date: forecast.expiryDate,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Daily backfill/incremental ingestion of Belgian TED award notices into
 * contract_awards (see vercel.json). Resumable without a separate checkpoint
 * table: each run starts from MAX(award_date) already stored for this
 * source, so a run cut short by the time budget just picks up where it left
 * off next time — the (source, source_reference) upsert makes any overlap
 * harmless. e-Procurement is not ingested here (see docs/database.md).
 *
 * Also runs the Company Following match step (see docs/database.md's
 * company_follow_matches entry): every upserted batch's winners are checked
 * against followed_companies, and matches are recorded for
 * app/api/cron/notify to email later.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startedAt = Date.now();

  const { data: latest, error: latestError } = await supabase
    .from("contract_awards")
    .select("award_date")
    .eq("source", "ted")
    .not("award_date", "is", null)
    .order("award_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    return NextResponse.json({ error: latestError.message }, { status: 500 });
  }

  const sinceDate = resolveIngestionSinceDate(latest?.award_date ?? null, AWARD_BACKFILL_MONTHS);
  const cpvPrefixes = sectorsToCpvPrefixes(SECTORS.map((s) => s.key));

  // Loaded once per run (small table, doesn't change mid-run) so every
  // page's upsert batch can be checked against it — see the
  // "Company Following" matching step below.
  const { data: followedCompanyRows, error: followedError } = await supabase
    .from("followed_companies")
    .select("user_id, followed_company_name");
  if (followedError) {
    return NextResponse.json({ error: followedError.message }, { status: 500 });
  }
  const followedCompanies = (followedCompanyRows ?? []).map((f) => ({
    userId: f.user_id as string,
    followedCompanyName: f.followed_company_name as string,
  }));

  let pagesProcessed = 0;
  let awardsUpserted = 0;
  let companyFollowMatches = 0;
  let totalNoticeCount: number | null = null;
  let reachedEnd = false;
  const errors: string[] = [];
  let iterationToken: string | undefined;

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    try {
      const page = await fetchHistoricalAwardsPage({
        cpvPrefixes,
        sinceDate,
        iterationToken,
      });
      totalNoticeCount = page.totalNoticeCount;
      pagesProcessed++;

      if (page.awards.length > 0) {
        const rows = await Promise.all(page.awards.map((a) => resolveAwardRow(a)));
        const { data: upsertedRows, error: upsertError } = await supabase
          .from("contract_awards")
          .upsert(rows, { onConflict: "source,source_reference" })
          .select("id, winner_name");
        if (upsertError) throw new Error(upsertError.message);
        awardsUpserted += page.awards.length;

        // Company Following (Feature 2): check this batch's winners against
        // everyone's followed_companies list, using the same normalization
        // as Market Share. Runs on every upserted row (new or re-upserted),
        // not just brand-new ones — company_follow_matches' unique
        // (user_id, contract_award_id) constraint makes re-matching an
        // already-seen award a harmless no-op via ignoreDuplicates below.
        const matches = matchFollowedCompanies(
          (upsertedRows ?? []).map((r) => ({ id: r.id as string, winnerName: r.winner_name as string | null })),
          followedCompanies
        );
        if (matches.length > 0) {
          const { error: matchError } = await supabase.from("company_follow_matches").upsert(
            matches.map((m) => ({
              user_id: m.userId,
              followed_company_name: m.followedCompanyName,
              contract_award_id: m.contractAwardId,
            })),
            { onConflict: "user_id,contract_award_id", ignoreDuplicates: true }
          );
          if (matchError) throw new Error(matchError.message);
          companyFollowMatches += matches.length;
        }
      }

      if (!page.nextIterationToken) {
        reachedEnd = true;
        break;
      }
      iterationToken = page.nextIterationToken;
    } catch (err) {
      errors.push(`page ${pagesProcessed + 1}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  // Re-derive estimated_expiry_date/duration_confidence for every award that
  // isn't already "confirmed" (i.e. TED gave no explicit duration for it),
  // so an edit to the CPV fallback table (lib/forecast/durationDefaults.ts)
  // between deploys reaches previously-ingested rows too, not just new ones
  // — this is the "recalculate whenever duration data changes" requirement.
  // "Confirmed" rows are skipped: their duration came directly from TED, not
  // this table, so there's nothing for it to change. There's no separate
  // "entering the forecast window" flag column — /forecast queries
  // estimated_expiry_date directly at render time instead of maintaining one.
  let fallbackRecomputed = 0;
  const { data: fallbackCandidates, error: fallbackFetchError } = await supabase
    .from("contract_awards")
    .select("id, award_date, cpv_codes, contract_duration_months, duration_confidence, estimated_expiry_date")
    .eq("source", "ted")
    .neq("duration_confidence", "confirmed");
  if (fallbackFetchError) {
    errors.push(`fallback recompute fetch: ${fallbackFetchError.message}`);
  } else {
    for (const row of fallbackCandidates ?? []) {
      const next = computeEstimatedExpiry({
        awardDate: row.award_date,
        explicitDurationMonths: null,
        explicitExpiryDate: null,
        cpvCodes: row.cpv_codes ?? [],
      });
      const changed =
        next.months !== row.contract_duration_months ||
        next.confidence !== row.duration_confidence ||
        next.expiryDate !== row.estimated_expiry_date;
      if (!changed) continue;

      const { error: updateError } = await supabase
        .from("contract_awards")
        .update({
          contract_duration_months: next.months,
          duration_confidence: next.confidence,
          estimated_expiry_date: next.expiryDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) {
        errors.push(`fallback recompute row ${row.id}: ${updateError.message}`);
        continue;
      }
      fallbackRecomputed++;
    }
  }

  return NextResponse.json({
    sinceDate,
    pagesProcessed,
    awardsUpserted,
    companyFollowMatches,
    totalNoticeCount,
    reachedEnd,
    fallbackRecomputed,
    errors,
  });
}
