import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchHistoricalAwardsPage, resolveIngestionSinceDate } from "@/lib/ted";
import { SECTORS, sectorsToCpvPrefixes } from "@/lib/sectors";

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
 * Daily backfill/incremental ingestion of Belgian TED award notices into
 * contract_awards (see vercel.json). Resumable without a separate checkpoint
 * table: each run starts from MAX(award_date) already stored for this
 * source, so a run cut short by the time budget just picks up where it left
 * off next time — the (source, source_reference) upsert makes any overlap
 * harmless. e-Procurement is not ingested here (see docs/database.md).
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

  let pagesProcessed = 0;
  let awardsUpserted = 0;
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
        const { error: upsertError } = await supabase.from("contract_awards").upsert(
          page.awards.map((a) => ({
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
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "source,source_reference" }
        );
        if (upsertError) throw new Error(upsertError.message);
        awardsUpserted += page.awards.length;
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

  return NextResponse.json({
    sinceDate,
    pagesProcessed,
    awardsUpserted,
    totalNoticeCount,
    reachedEnd,
    errors,
  });
}
