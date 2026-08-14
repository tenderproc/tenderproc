import { AwardedTender, TenderNotice } from "./types";
import { LANGUAGES } from "./languages";

const TED_SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search";

// Fields requested from TED. Field names come from the eForms data model.
// If TED changes field naming, check the live Swagger docs at
// https://ted.europa.eu/api/documentation/index.html and update this list.
const FIELDS = [
  "publication-number",
  "notice-title",
  "notice-type",
  "buyer-name",
  "buyer-country",
  "total-value",
  "total-value-cur",
  "estimated-value-proc",
  "estimated-value-cur-proc",
  "estimated-value-lot",
  "estimated-value-cur-lot",
  "framework-maximum-value-lot",
  "framework-maximum-value-cur-lot",
  "framework-maximum-value-glo",
  "framework-maximum-value-cur-glo",
  "deadline-receipt-request",
  "publication-date",
  "classification-cpv",
];

// Fields for the awards search (searchAwardedTenders) — a different shape
// than the open-call fields above (no deadline/estimated-value, but winner
// + result-value instead).
const AWARD_FIELDS = [
  "publication-number",
  "notice-title",
  "notice-type",
  "buyer-name",
  "buyer-country",
  "winner-name",
  "winner-country",
  "result-value-lot",
  "result-value-cur-lot",
  "publication-date",
  "classification-cpv",
];

// TED's own eForms notice-subtype taxonomy: "cn-*" = contract notice (a
// genuine open call for tenders), "pin-cfc-*" = prior information notice
// used AS a call for competition (also open, mostly below-threshold light
// regimes). Everything else — "can-*" (already awarded), "pin-only"
// (advance info, not yet open), "brin-eeig"/"qu-sy"/"veat" (administrative,
// not a tender to bid on) — is not something an SME can currently bid on.
export function isOpenCallNotice(noticeType: string | null | undefined): boolean {
  if (!noticeType) return false;
  return noticeType.startsWith("cn-") || noticeType.startsWith("pin-cfc");
}

function toYyyymmdd(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export interface TedSearchParams {
  keyword?: string;
  cpv?: string;
  /**
   * CPV division/group prefixes (e.g. "45" for construction) to filter to —
   * used for sector-based preferences, as opposed to `cpv`'s single exact
   * match. TED's query language doesn't reliably support OR/prefix matching
   * on classification-cpv, so this is applied client-side after fetching a
   * larger batch rather than added to the query.
   */
  cpvPrefixes?: string[];
  /**
   * Preferred display language(s) (see lib/languages.ts), in priority order.
   * TED titles come back translated into every EU language, so this can't
   * usefully filter which notices appear — instead it controls which
   * translation of the title is shown, falling back to the default
   * priority if none of the preferred languages are present.
   */
  languageKeys?: string[];
  /** Excludes already-awarded and other non-biddable notice types (see isOpenCallNotice). */
  onlyOpenCalls?: boolean;
  /** YYYY-MM-DD; added as query clauses (TED supports date comparisons natively). */
  deadlineAfter?: string;
  deadlineBefore?: string;
  /** Applied client-side against totalValueRaw — TED's value lives in one of 5 different fields depending on procedure type, so a single query clause can't cover all cases. */
  valueMin?: number;
  valueMax?: number;
  limit?: number;
}

/**
 * Searches TED for active Belgian public procurement notices.
 * TED's Search API is free and requires no authentication for read access.
 * Coverage note: TED only carries notices ABOVE the EU publication thresholds.
 * Below-threshold Belgian tenders live on regional/municipal portals and are
 * out of scope for this beta.
 */
export async function searchBelgianTenders(
  params: TedSearchParams = {}
): Promise<TenderNotice[]> {
  const clauses = ["buyer-country=BEL"];
  if (params.keyword) {
    const escaped = params.keyword.replace(/"/g, '\\"');
    clauses.push(`FT~"${escaped}"`);
  }
  if (params.cpv) {
    clauses.push(`classification-cpv=${params.cpv}`);
  }
  if (params.deadlineAfter) {
    clauses.push(`deadline-receipt-request>=${toYyyymmdd(params.deadlineAfter)}`);
  }
  if (params.deadlineBefore) {
    clauses.push(`deadline-receipt-request<=${toYyyymmdd(params.deadlineBefore)}`);
  }
  const query = `${clauses.join(" AND ")} SORT BY publication-date DESC`;

  const displayLimit = params.limit ?? 30;
  const needsOverfetch =
    params.cpvPrefixes?.length || params.onlyOpenCalls || params.valueMin != null || params.valueMax != null;
  const fetchLimit = needsOverfetch ? Math.max(displayLimit * 4, 100) : displayLimit;
  const titlePriority = buildTitlePriority(params.languageKeys);

  const res = await fetch(TED_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      fields: FIELDS,
      limit: fetchLimit,
      scope: "ACTIVE",
      checkQuerySyntax: false,
      paginationMode: "ITERATION",
    }),
    // Notices don't change second-to-second; cache briefly to avoid
    // hammering TED on every dashboard load during the beta.
    next: { revalidate: 900 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TED API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  let rawNotices: Record<string, unknown>[] = data?.notices ?? data?.results ?? [];

  if (params.onlyOpenCalls) {
    rawNotices = rawNotices.filter((n) => isOpenCallNotice(firstValue(n["notice-type"])));
  }

  let notices = rawNotices.map((n): TenderNotice => {
    const pubNumber = n["publication-number"] ?? n.publicationNumber ?? "unknown";
    const value = extractValue(n);
    return {
      publicationNumber: String(pubNumber),
      title: firstValue(n["notice-title"], titlePriority) ?? "Untitled notice",
      buyerName: firstValue(n["buyer-name"]) ?? "Unknown buyer",
      buyerCountry: firstValue(n["buyer-country"]) ?? "BEL",
      totalValue: value.text,
      totalValueRaw: value.raw,
      deadline: firstValue(n["deadline-receipt-request"]),
      publicationDate: firstValue(n["publication-date"]),
      cpvCodes: toArray(n["classification-cpv"]),
      url: `https://ted.europa.eu/en/notice/-/detail/${pubNumber}`,
    };
  });

  if (params.cpvPrefixes?.length) {
    const prefixes = params.cpvPrefixes;
    notices = notices.filter((t) =>
      t.cpvCodes.some((code) => prefixes.some((p) => code.startsWith(p)))
    );
  }

  if (params.valueMin != null) {
    const min = params.valueMin;
    notices = notices.filter((t) => t.totalValueRaw != null && t.totalValueRaw >= min);
  }
  if (params.valueMax != null) {
    const max = params.valueMax;
    notices = notices.filter((t) => t.totalValueRaw != null && t.totalValueRaw <= max);
  }

  return notices.slice(0, displayLimit);
}

/**
 * Fetches a single notice by publication number for the detail page.
 */
export async function getTenderById(
  id: string,
  languageKeys?: string[]
): Promise<TenderNotice | null> {
  const titlePriority = buildTitlePriority(languageKeys);
  const res = await fetch(TED_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `publication-number="${id}"`,
      fields: FIELDS,
      limit: 1,
      scope: "ALL",
      checkQuerySyntax: false,
      paginationMode: "ITERATION",
    }),
    next: { revalidate: 900 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[getTenderById] TED API error ${res.status} for id "${id}": ${body.slice(0, 500)}`);
    return null;
  }
  const data = await res.json();
  const rawNotices: Record<string, unknown>[] = data?.notices ?? data?.results ?? [];
  if (!rawNotices.length) {
    console.error(`[getTenderById] No notice found for id "${id}". Raw response: ${JSON.stringify(data).slice(0, 500)}`);
    return null;
  }
  const n = rawNotices[0];
  const value = extractValue(n);
  return {
    publicationNumber: id,
    title: firstValue(n["notice-title"], titlePriority) ?? "Untitled notice",
    buyerName: firstValue(n["buyer-name"]) ?? "Unknown buyer",
    buyerCountry: firstValue(n["buyer-country"]) ?? "BEL",
    totalValue: value.text,
    totalValueRaw: value.raw,
    deadline: firstValue(n["deadline-receipt-request"]),
    publicationDate: firstValue(n["publication-date"]),
    cpvCodes: toArray(n["classification-cpv"]),
    url: `https://ted.europa.eu/en/notice/-/detail/${id}`,
  };
}

export interface AwardSearchParams {
  keyword?: string;
  cpvPrefixes?: string[];
  /** How far back to look for awards, by publication date. Default 90. */
  daysBack?: number;
  limit?: number;
}

/**
 * Searches TED for recently-awarded Belgian contracts (notice-type
 * can-standard) — winner name, awarded value, buyer. This is a snapshot of
 * recent awards, not a full historical archive: it fetches one batch within
 * the `daysBack` window rather than paginating through TED's full history.
 */
export async function searchAwardedTenders(
  params: AwardSearchParams = {}
): Promise<AwardedTender[]> {
  const daysBack = params.daysBack ?? 90;
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().slice(0, 10).replace(/-/g, "");

  const clauses = ["buyer-country=BEL", "notice-type=can-standard", `publication-date>=${sinceStr}`];
  if (params.keyword) {
    const escaped = params.keyword.replace(/"/g, '\\"');
    clauses.push(`FT~"${escaped}"`);
  }
  const query = `${clauses.join(" AND ")} SORT BY publication-date DESC`;

  const displayLimit = params.limit ?? 100;
  const fetchLimit = params.cpvPrefixes?.length
    ? Math.max(displayLimit * 4, 200)
    : displayLimit;

  const res = await fetch(TED_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      fields: AWARD_FIELDS,
      limit: fetchLimit,
      scope: "ACTIVE",
      checkQuerySyntax: false,
      paginationMode: "ITERATION",
    }),
    next: { revalidate: 900 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TED API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawNotices: Record<string, unknown>[] = data?.notices ?? data?.results ?? [];

  let awards = rawNotices.map((n): AwardedTender => {
    const pubNumber = n["publication-number"] ?? "unknown";
    const rawAmount = firstValue(n["result-value-lot"]);
    const currency = firstValue(n["result-value-cur-lot"]) ?? "EUR";
    const numeric = rawAmount != null ? Number(String(rawAmount).replace(/[^\d.]/g, "")) : NaN;
    const hasNumeric = !isNaN(numeric) && numeric > 0;
    return {
      publicationNumber: String(pubNumber),
      title: firstValue(n["notice-title"]) ?? "Untitled notice",
      buyerName: firstValue(n["buyer-name"]) ?? "Unknown buyer",
      winnerName: firstValue(n["winner-name"]) ?? "Unknown winner",
      winnerCountry: firstValue(n["winner-country"]) ?? "BEL",
      value: hasNumeric
        ? `${currency} ${new Intl.NumberFormat("en-BE").format(numeric)}`
        : null,
      valueRaw: hasNumeric ? numeric : null,
      publicationDate: firstValue(n["publication-date"]),
      cpvCodes: toArray(n["classification-cpv"]),
      url: `https://ted.europa.eu/en/notice/-/detail/${pubNumber}`,
    };
  });

  if (params.cpvPrefixes?.length) {
    const prefixes = params.cpvPrefixes;
    awards = awards.filter((a) =>
      a.cpvCodes.some((code) => prefixes.some((p) => code.startsWith(p)))
    );
  }

  return awards.slice(0, displayLimit);
}

// TED lists the tender's value under notice section 2.1.3 when the buyer
// discloses it — often it's absent. Which underlying field holds it depends
// on the procedure type: a normal contract uses BT-27 (Estimated Value,
// "-proc"/"-lot"), while a framework agreement instead uses BT-271
// (Framework Maximum Value, "-lot"/"-glo") — same UI section, different
// field. We check both kinds, then fall back to an award's total value.
const VALUE_FIELD_PAIRS: [string, string][] = [
  ["estimated-value-proc", "estimated-value-cur-proc"],
  ["estimated-value-lot", "estimated-value-cur-lot"],
  ["framework-maximum-value-lot", "framework-maximum-value-cur-lot"],
  ["framework-maximum-value-glo", "framework-maximum-value-cur-glo"],
  ["total-value", "total-value-cur"],
];

let loggedValueSample = false;

function extractValue(n: Record<string, unknown>): { text: string | null; raw: number | null } {
  for (const [amountKey, currencyKey] of VALUE_FIELD_PAIRS) {
    const rawAmount = firstValue(n[amountKey]);
    if (rawAmount == null) continue;
    const currency = firstValue(n[currencyKey]) ?? "EUR";
    const isFrameworkMax = amountKey.startsWith("framework-maximum-value");
    const label = isFrameworkMax ? "up to" : "≈";
    const numeric = Number(String(rawAmount).replace(/[^\d.]/g, ""));
    if (!isNaN(numeric) && numeric > 0) {
      return {
        text: `${label} ${currency} ${new Intl.NumberFormat("en-BE").format(numeric)}`,
        raw: numeric,
      };
    }
    return { text: `${label} ${currency} ${rawAmount}`, raw: null };
  }

  if (!loggedValueSample) {
    loggedValueSample = true;
    const valueLikeKeys = Object.keys(n).filter((k) => /value/i.test(k));
    console.error(`[extractValue] No known value field matched. Value-like keys on this notice: ${JSON.stringify(valueLikeKeys)}`);
  }
  return { text: null, raw: null };
}

// eForms fields sometimes come back as multilingual objects ({en: "...", hu: "...", fr: "..."})
// or arrays. Normalize to a single display string, preferring English, then
// Belgium's own official languages, before falling back to whatever exists —
// so a notice never displays in an unrelated language like Hungarian just
// because it happened to be listed first in the object.
const LANGUAGE_PRIORITY = [
  "en", "eng",
  "fr", "fra", "fre",
  "nl", "nld", "dut",
  "de", "deu", "ger",
];

let loggedSample = false;

function firstValue(v: unknown, priority: string[] = LANGUAGE_PRIORITY): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? firstValue(v[0], priority) : null;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    // Walk the priority list itself (not the object's keys) so the first
    // matching language in rank order wins, regardless of what order TED
    // happens to serialize the object's keys in.
    const lowerKeyToActual = new Map(keys.map((k) => [k.toLowerCase(), k]));
    const preferredKey = priority
      .map((p) => lowerKeyToActual.get(p))
      .find((k): k is string => Boolean(k));

    if (!preferredKey && !loggedSample) {
      // One-time debug log so we can see TED's real key format instead of guessing.
      loggedSample = true;
      console.error(`[firstValue] No known language key matched. Object keys were: ${JSON.stringify(keys)}. Full object: ${JSON.stringify(obj).slice(0, 300)}`);
    }

    const preferred = preferredKey ? obj[preferredKey] : Object.values(obj)[0];
    return firstValue(preferred, priority);
  }
  return null;
}

// Builds a firstValue() priority list from a user's selected display
// languages: their picks come first (in lib/languages.ts's canonical
// order), then the default priority as a fallback so a title still
// resolves to something even if none of their picks are present.
function buildTitlePriority(languageKeys?: string[]): string[] {
  if (!languageKeys?.length) return LANGUAGE_PRIORITY;
  const preferred = LANGUAGES.filter((l) => languageKeys.includes(l.key)).flatMap(
    (l) => l.aliases
  );
  return [...preferred, ...LANGUAGE_PRIORITY];
}

function toArray(v: unknown): string[] {
  if (v == null) return [];
  const values = Array.isArray(v) ? v.map((x) => String(firstValue(x) ?? x)) : [String(firstValue(v) ?? v)];
  return Array.from(new Set(values));
}
