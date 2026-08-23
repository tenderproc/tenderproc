import { createAdminClient } from "@/lib/supabase/admin";
import { TenderNotice } from "@/lib/types";

const SOURCE_NAMES: Record<string, string> = {
  wallonia_deliberations: "Wallonia — deliberations.be",
  wallonia_conseilcommunal: "Wallonia — conseilcommunal.be",
  flanders_gelinkt_notuleren: "Flanders — Gelinkt Notuleren",
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
 * Per explicit product decision, every scraped record is returned
 * regardless of estimated value or notice_kind (open/awarded/unclear) —
 * only rows already confirmed as an exact duplicate of a live TED notice
 * are excluded, to avoid showing the same tender twice under two
 * different presentations.
 *
 * One additional exclusion: deliberations.be (wallonia_deliberations)
 * stamps every "Projet de décision" (draft, not yet adopted by the
 * commune) with a standard boilerplate disclaimer in its description
 * ("Ce projet de délibération est un document préparatoire...Ce texte
 * n'a pas encore été adopté par l'autorité communale."). Those are drafts
 * that can still change or be rejected, not real procurement decisions,
 * so they're filtered out here rather than shown as an "opportunity".
 *
 * Keep this marker to a single phrase, not a longer quoted sentence: the
 * scraper joins each card's DOM text nodes with newlines, so a multi-line
 * disclaimer sentence has newlines where this constant would need spaces —
 * a longer marker silently never matches. "document préparatoire" always
 * lands intact on one text node, confirmed 2026-08-23 against 319 real
 * draft rows (0 misses) with no false positives against non-draft rows.
 */
const DRAFT_DISCLAIMER_MARKER = "document préparatoire";

export async function getExternalOpportunities(): Promise<TenderNotice[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("external_opportunities")
    .select(
      "source, source_reference, title, buyer_name, description, cpv_codes, estimated_value, estimated_value_currency, deadline, publication_date, region, source_url, dedup_status"
    )
    .neq("dedup_status", "confirmed_duplicate")
    .not("description", "ilike", `%${DRAFT_DISCLAIMER_MARKER}%`)
    .order("publication_date", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) {
    throw new Error(`external_opportunities query failed: ${error.message}`);
  }

  return ((data as ExternalOpportunityRow[] | null) ?? []).map(rowToTenderNotice);
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
    titleLanguages: [],
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
