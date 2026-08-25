import { createAdminClient } from "@/lib/supabase/admin";
import { TenderNotice } from "@/lib/types";

const SOURCE_NAMES: Record<string, string> = {
  wallonia_deliberations: "Wallonia — deliberations.be",
  wallonia_conseilcommunal: "Wallonia — conseilcommunal.be",
  flanders_gelinkt_notuleren: "Flanders — Gelinkt Notuleren",
};

/**
 * Each regional source's official council language, used as titleLanguages
 * for the sidebar's language filter (lib/ted.ts/lib/bosa.ts's
 * filterLanguageKeys). Unlike TED/BOSA there's no per-notice multilingual
 * title field to parse here — these are plain-text council-decision scrapes
 * in whatever language that commune publishes in. But that's actually a
 * reliable signal, not a guess: Walloon communes publish exclusively in
 * French and Flemish communes exclusively in Dutch (no bilingual source is
 * ingested — Brussels has no equivalent source at all), so the source
 * itself determines the language with certainty.
 */
const SOURCE_LANGUAGE: Record<string, string> = {
  wallonia_deliberations: "fr",
  wallonia_conseilcommunal: "fr",
  flanders_gelinkt_notuleren: "nl",
};

export const EXTERNAL_PREFIX = "EXT:";

interface ExternalOpportunityRow {
  source: string;
  source_reference: string;
  title: string;
  buyer_name: string | null;
  description: string | null;
  cpv_codes: string[];
  estimated_value: number | null;
  estimated_value_currency: string | null;
  deadline: string | null;
  publication_date: string | null;
  region: string | null;
  source_url: string;
  dedup_status: "candidate" | "confirmed_duplicate";
}

/**
 * Reads the three regional Wallonia/Flanders sources scraped and pushed by
 * the sibling tenderproc_wallonia_scraper project (see
 * supabase-external-opportunities-migration.sql). Unlike TED/BOSA this is
 * never fetched live — the underlying sites require a multi-hour crawl
 * across hundreds of endpoints, refreshed weekly by that project's own
 * scheduled task, not on every Opportunities page load.
 *
 * Per explicit product decision, every scraped record is a candidate
 * regardless of estimated value or notice_kind (open/awarded/unclear) —
 * biddability itself is decided by the `bid_status` column (see
 * supabase-external-opportunities-bid-status-migration.sql), populated by
 * the sibling scraper's classify_bid_status.py: a cheap marker tier for
 * confidently-non-biddable cases (draft/unadopted, negotiated-without-
 * publication, closed shortlist, named award, empty description), then an
 * LLM (Claude Haiku) for the genuinely ambiguous remainder that no keyword
 * pattern can resolve. Only `bid_status = 'open_call'` is shown here — NULL
 * (not yet classified) and 'unclear' fail closed, same as an unconfirmed
 * record, so a newly-scraped row stays hidden until the weekly classifier
 * run catches up to it.
 *
 * This used to be a set of query-level marker filters duplicated by hand in
 * this file; those markers are now exactly the same ones classify_bid_status.py
 * runs at classification time (kept in sync there, not here), so filtering
 * on the resulting column is equivalent but doesn't need re-deriving on
 * every page load. Backfilled once against the full 3,939-row table
 * 2026-08-25: 127 open_call, 3,811 not_biddable, 1 unclear.
 */

/**
 * Exclusion 7: a Wallonia/Flanders council-decision record with no
 * `deadline` isn't itself something a company can bid into — it's the
 * commune's internal authorization to go start a procurement, not the
 * published notice with a real submission window (see
 * [[project_tenderproc_opportunities_missing_deadlines]] / a live example:
 * a Walhain road-works decision surfaced in Opportunities while the actual
 * biddable notice, with a real deadline, only existed as a separate BOSA
 * record days later). At user's explicit request 2026-08-23: only records
 * with a genuine deadline count as an "actual tender" here.
 *
 * Originally implemented as a general "deadline present" condition when
 * none of the three regional scrapers extracted one at all (structural
 * limitation, not a bug) — that excluded 100% of external_opportunities
 * rows. Since then, wallonia_deliberations gained real deadline extraction
 * (extract_deadline.py in the sibling scraper project, parses an explicit
 * absolute date like "la date limite de dépôt des offres est fixée au 30
 * juin 2026 à 12h00" out of the decision's own prose — confirmed live
 * 2026-08-23 against 21 real matches, each manually checked against source
 * text). A present-but-already-passed deadline is exactly as non-biddable
 * as no deadline at all — same "no closed tenders" principle as
 * [[project_tenderproc_bosa_stale_deadline_filter]]'s BOSA fix — so this
 * now checks both presence AND recency, kept general (not source-specific)
 * for the same forward-compatibility reason as before.
 *
 * Applied client-side (see the `.filter()` below) rather than as a query
 * clause — chaining one more `.not()` onto this builder pushed TypeScript's
 * type-checker over its recursion limit ("Type instantiation is excessively
 * deep"), a known supabase-js issue with long fluent chains, not a logic
 * problem with the filter itself.
 */
function hasNoUsableDeadline(deadline: string | null): boolean {
  if (deadline == null) return true;
  const deadlineMs = new Date(deadline).getTime();
  return isNaN(deadlineMs) || deadlineMs <= Date.now();
}

export async function getExternalOpportunities(): Promise<TenderNotice[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("external_opportunities")
    .select(
      "source, source_reference, title, buyer_name, description, cpv_codes, estimated_value, estimated_value_currency, deadline, publication_date, region, source_url, dedup_status"
    )
    .neq("dedup_status", "confirmed_duplicate")
    .eq("bid_status", "open_call")
    .order("publication_date", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) {
    throw new Error(`external_opportunities query failed: ${error.message}`);
  }

  return ((data as ExternalOpportunityRow[] | null) ?? [])
    .filter((row) => !hasNoUsableDeadline(row.deadline))
    .map(rowToTenderNotice);
}

export function rowToTenderNotice(row: ExternalOpportunityRow): TenderNotice {
  return {
    publicationNumber: `${EXTERNAL_PREFIX}${row.source}:${row.source_reference}`,
    title: row.title,
    buyerName: row.buyer_name ?? row.region ?? "Unknown buyer",
    buyerCountry: "BEL",
    totalValue:
      row.estimated_value != null
        ? `${row.estimated_value_currency ?? "EUR"} ${row.estimated_value.toLocaleString()}`
        : null,
    totalValueRaw: row.estimated_value,
    deadline: row.deadline,
    publicationDate: row.publication_date,
    cpvCodes: row.cpv_codes ?? [],
    titleLanguages: SOURCE_LANGUAGE[row.source] ? [SOURCE_LANGUAGE[row.source]] : [],
    url: row.source_url,
  };
}

/**
 * Detail-page lookup for a regional-source tender, dispatched from
 * lib/tenders/getTenderById.ts via the "EXT:<source>:<reference>" id
 * scheme. Maps into TenderDetail the same way lib/bosa.ts's
 * getBosaTenderById does for BOSA — null on not-found rather than
 * throwing, matching that contract.
 */
export async function getExternalOpportunityById(source: string, sourceReference: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("external_opportunities")
    .select(
      "source, source_reference, title, buyer_name, description, cpv_codes, estimated_value, estimated_value_currency, deadline, publication_date, region, source_url, dedup_status"
    )
    .eq("source", source)
    .eq("source_reference", sourceReference)
    .maybeSingle();

  if (error) throw new Error(`external_opportunities lookup failed: ${error.message}`);
  if (!data) return null;

  const row = data as ExternalOpportunityRow;
  return {
    ...rowToTenderNotice(row),
    sourceName: externalSourceName(row.source),
    description: row.description,
    procedureType: null,
    region: row.region,
    documentUrls: [],
  };
}

export function externalSourceName(source: string): string {
  return SOURCE_NAMES[source] ?? source;
}

/**
 * Short badge label for any TenderNotice regardless of source, derived
 * from the same publicationNumber prefix scheme lib/tenders/getTenderById.ts
 * already dispatches on (bare = TED, "BOSA:" = BOSA, "EXT:<source>:" = one
 * of the three regional sources) — never leave provenance ambiguous when
 * five sources with three different freshness/completeness models are
 * shown side by side.
 */
export function tenderSourceBadge(publicationNumber: string): string {
  if (publicationNumber.startsWith(EXTERNAL_PREFIX)) {
    const source = publicationNumber.slice(EXTERNAL_PREFIX.length).split(":")[0];
    return externalSourceName(source);
  }
  if (publicationNumber.startsWith("BOSA:")) return "BOSA e-Notification";
  return "TED";
}
