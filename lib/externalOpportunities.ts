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
 * Per explicit product decision, every scraped record is returned
 * regardless of estimated value or notice_kind (open/awarded/unclear) —
 * only rows already confirmed as an exact duplicate of a live TED notice
 * are excluded, to avoid showing the same tender twice under two
 * different presentations. The exclusions below are carve-outs from that
 * blanket rule, not exceptions to it: each catches a specific,
 * confidently-detectable non-biddable case rather than attempting the
 * general open/awarded/unclear classification the product decision above
 * deliberately avoids (that needs real NLP — see the sibling scraper
 * project's dedup-classifier work, which left ~40% of records
 * unclassified even with that as its sole goal). A large residual bucket
 * of genuinely ambiguous "council approved specs/procedure, no explicit
 * open-or-closed signal in the text" records is deliberately left alone
 * for the same reason — see NON_TENDER_MARKERS below for the line drawn
 * there.
 *
 * Exclusion 1: deliberations.be (wallonia_deliberations) stamps every
 * "Projet de décision" (draft, not yet adopted by the commune) with a
 * standard boilerplate disclaimer in its description ("Ce projet de
 * délibération est un document préparatoire...Ce texte n'a pas encore été
 * adopté par l'autorité communale."). Those are drafts that can still
 * change or be rejected, not real procurement decisions, so they're
 * filtered out here rather than shown as an "opportunity".
 *
 * Keep this marker to a single phrase, not a longer quoted sentence: the
 * scraper joins each card's DOM text nodes with newlines, so a multi-line
 * disclaimer sentence has newlines where this constant would need spaces —
 * a longer marker silently never matches. "document préparatoire" always
 * lands intact on one text node, confirmed 2026-08-23 against 319 real
 * draft rows (0 misses) with no false positives against non-draft rows.
 */
const DRAFT_DISCLAIMER_MARKER = "document préparatoire";

/**
 * Exclusion 2: council decisions that explicitly name a "negotiated
 * procedure without prior publication" (French: procédure négociée sans
 * publication/publicité préalable; Dutch: onderhandelingsprocedure zonder
 * voorafgaande bekendmaking) invite a small, already-chosen list of firms
 * directly — there's no public call and nothing for an outside company to
 * bid into, even though (unlike the draft-disclaimer case) the decision
 * itself is final and real. Same rationale as lib/ted.ts's onlyOpenCalls
 * and lib/bosa.ts's onlyOpenCalls: an "opportunity" on this page should be
 * something a visitor can actually respond to.
 *
 * All three phrases confirmed live 2026-08-23 against the full table
 * (3,939 rows): 632 matching rows total, 0 cases where whitespace/newline
 * normalization would have changed the match (the failure mode that broke
 * DRAFT_DISCLAIMER_MARKER above), and manual review of a sample per phrase
 * found no negated/false-positive usage (e.g. no "n'a pas retenu la
 * procédure négociée..." case). wallonia_conseilcommunal never matches —
 * expected, not a gap introduced here: that source's Motivations/Decisions
 * text is structurally absent (see project memory), so it has no
 * procedure-type prose to match against either way.
 */
const NEGOTIATED_WITHOUT_PUBLICATION_MARKERS = [
  "sans publication préalable",
  "sans publicité préalable",
  "zonder voorafgaande bekendmaking",
];

/**
 * Exclusion 3: a decision can invite a closed shortlist of firms directly
 * without ever naming the "negotiated without prior publication" procedure
 * by name — the tell is the shortlist itself ("firms/companies to
 * contact/invite/consult"), which only exists because the buyer already
 * picked who gets asked; nobody outside that list can respond. Same
 * closed-procedure rationale as exclusion 2, different phrasing.
 *
 * Exclusion 4: a decision naming the actual winner and award amount
 * ("this contract is awarded to X for €Y") is by definition already
 * decided — there's nothing left to bid on, same as a TED/BOSA award
 * notice.
 *
 * Both confirmed live 2026-08-23 against the 1,561 rows still passing
 * exclusions 1-2 (i.e. checked for incremental value, not against the
 * full table): "te contacteren"/"uit te nodigen" (NL) and "à consulter"
 * (FR) → 65 rows; the award markers → 96 rows across two Dutch verb forms
 * ("gegund aan" — past participle, "this contract IS awarded to X" — and
 * "gunnen aan" — infinitive, "decides TO award to X"; neither is a
 * substring of the other, both needed) plus French ("marché est
 * attribué", "attribuer le marché à", "décide d'attribuer" in both its
 * curly-’ and straight-' apostrophe spellings — real scraped text mixes
 * both for the same word, so both variants are listed). Every match
 * manually reviewed for negation (e.g. a decision NOT to award, or
 * explicitly declining a shortlist) — none found — and for the
 * newline-splitting failure mode — none found.
 *
 * Exclusion 5 (applied after the query, not as a marker — see the filter
 * below): a description that's empty or contains only a scraper-side
 * placeholder/whitespace artifact (confirmed live: 390 rows are the exact
 * literal string "Geef korte beschrijving op" — a Dutch UI form
 * placeholder meaning "enter a short description here" that a source
 * council left blank; 43 more are blank or a bare zero-width space) can
 * never represent an actionable opportunity regardless of its true
 * open/closed status, since there's no content to act on either way.
 */
const NON_TENDER_MARKERS = [
  ...NEGOTIATED_WITHOUT_PUBLICATION_MARKERS,
  "te contacteren",
  "uit te nodigen",
  // Same closed-shortlist concept as "uit te nodigen" (infinitive, "to be
  // invited") but a different Dutch verb form the original marker missed:
  // "N ondernemers worden uitgenodigd om deel te nemen aan de aanvaarde
  // factuur" (N companies are [being] invited to participate in the
  // accepted-invoice procedure) — Flanders' low-value equivalent of a
  // negotiated-without-publication invite list. Confirmed live 2026-08-23:
  // 48 rows total, 36 already excluded by an existing marker anyway
  // (redundant), 12 net-new — every one manually checked, all genuine
  // closed invitations to a specific named-count shortlist, no negated
  // ("niet uitgenodigd") usage found anywhere in the table.
  "uitgenodigd",
  "à consulter",
  "gegund aan",
  "gunnen aan",
  "marché est attribué",
  "attribuer le marché à",
  "décide d’attribuer", // curly apostrophe (U+2019) — see comment above
  "décide d'attribuer", // straight apostrophe (U+0027) — see comment above
];

/**
 * Exclusion 6: a decision can invite a closed shortlist without either of
 * exclusion 3's tells ("à consulter", "te contacteren"/"uit te nodigen") —
 * the same closed-consultation pattern also shows up as "consultation des
 * <category> suivant(e)s :" followed by the named list (e.g. "consultation
 * des établissements de crédits suivants : BELFIUS...", "consultation des
 * entreprises suivantes : DISTRINOX..."). A plain substring doesn't
 * generalize here — the noun between "des" and "suivant(e)s" varies
 * ("entreprises", "établissements de crédits", etc.) — so this is a regex
 * (PostgREST `imatch`, case-insensitive `~*`) rather than one more entry in
 * NON_TENDER_MARKERS.
 *
 * Confirmed live 2026-08-23 against the full table (3,939 rows): 48 rows
 * contain "consultation" at all; this pattern matches exactly 2 of them
 * (Gembloux kitchen-equipment purchase, Ham-sur-Heure-Nalinnes loan
 * financing), both genuine closed-shortlist invitations to named companies.
 * Manually reviewed the other 46 "consultation" rows to rule out false
 * positives — all were unrelated uses (delegating supplier consultation to
 * SPW, a procedural document literally named "dossier de consultation", a
 * file "mis à la consultation des conseillers communaux" for internal
 * council review, general framework-agreement call-off descriptions) — none
 * name a specific closed shortlist the way the 2 matches do.
 */
const CLOSED_SHORTLIST_CONSULTATION_PATTERN =
  "consultation des.{0,60}suivante?s?[[:space:]]*:";

const EMPTY_DESCRIPTION_PLACEHOLDER = "geef korte beschrijving op";

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
 * Applied client-side (see the `.filter()` below, alongside
 * hasNoRealDescription) rather than as a query clause — chaining one more
 * `.not()` onto this builder pushed TypeScript's type-checker over its
 * recursion limit ("Type instantiation is excessively deep"), a known
 * supabase-js issue with long fluent chains, not a logic problem with the
 * filter itself.
 */
function hasNoUsableDeadline(deadline: string | null): boolean {
  if (deadline == null) return true;
  const deadlineMs = new Date(deadline).getTime();
  return isNaN(deadlineMs) || deadlineMs <= Date.now();
}

/** True for a description with no real content: null, blank, a bare zero-width space, or the scraper's own placeholder text (see exclusion 5 above). */
function hasNoRealDescription(description: string | null): boolean {
  const stripped = (description ?? "").replace(/[\s​]+/g, "");
  return stripped.length === 0 || stripped.toLowerCase() === EMPTY_DESCRIPTION_PLACEHOLDER.replace(/\s+/g, "");
}

export async function getExternalOpportunities(): Promise<TenderNotice[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("external_opportunities")
    .select(
      "source, source_reference, title, buyer_name, description, cpv_codes, estimated_value, estimated_value_currency, deadline, publication_date, region, source_url, dedup_status"
    )
    .neq("dedup_status", "confirmed_duplicate")
    .not("description", "ilike", `%${DRAFT_DISCLAIMER_MARKER}%`)
    .not("description", "imatch", CLOSED_SHORTLIST_CONSULTATION_PATTERN);
  for (const marker of NON_TENDER_MARKERS) {
    query = query.not("description", "ilike", `%${marker}%`);
  }
  const { data, error } = await query
    .order("publication_date", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) {
    throw new Error(`external_opportunities query failed: ${error.message}`);
  }

  return ((data as ExternalOpportunityRow[] | null) ?? [])
    .filter((row) => !hasNoRealDescription(row.description))
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
