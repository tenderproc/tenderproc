import { load, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import { randomUUID } from "crypto";
import { TenderDetail, TenderNotice } from "./types";
import { LANGUAGES } from "./languages";

/**
 * Live client for BOSA's e-Notification platform (publicprocurement.be) —
 * a second tender source alongside TED, for Belgian below-threshold
 * notices TED never carries. Ported from the standalone Python scraper at
 * (sibling project) tenderproc_bosa_scraper/bosa_scraper/{auth,api_client,
 * xml_extract}.py, which discovered and verified this API against the
 * live site. Only what the detail page needs is ported here — search/
 * listing integration is a separate, not-yet-built feature.
 *
 * Auth: BOSA's own frontend authenticates anonymously via an OAuth2
 * client-credentials grant against Keycloak, using a client_id/secret it
 * fetches from a public, unauthenticated `env.config.js`. We replicate
 * that rather than requiring a real account — no credentials are needed
 * for the default setup. BOSA_CLIENT_ID/BOSA_CLIENT_SECRET/BOSA_AUTH_REALM
 * env vars are optional overrides only, in case BOSA changes how the
 * anonymous client is exposed.
 *
 * Data shape gotcha (confirmed live, not documented anywhere): unlike
 * TED's single API response carrying every field, BOSA splits data across
 * two shapes. GET /publication-workspaces/{id} (this file's
 * `getWorkspaceDetail`) gives the workspace envelope — buyer name
 * (`organisationNames`, top-level, NOT nested under an "organisation"
 * key the way the *search-listing* JSON nests it) and the per-version
 * `notice.xmlContent` — but NOT title, CPV, procedure type, deadline, or
 * region. Those only exist in the eForms UBL XML itself, so
 * `extractNoticeMetadata` below parses them out of the same XML that
 * already carries the description.
 */

const BOSA_BASE_URL = process.env.BOSA_BASE_URL || "https://www.publicprocurement.be";

const CONFIG_JS_PATTERN = /VITE_AUTH_(CLIENTID|CLIENTSECRET|REALM|URL):\s*'([^']*)'/g;

interface TokenState {
  accessToken: string;
  expiresAt: number; // ms epoch
}

let cachedClient: { id: string; secret: string; realm: string; authUrl: string } | null = null;
let cachedToken: TokenState | null = null;

async function discoverClient() {
  if (cachedClient) return cachedClient;
  if (process.env.BOSA_CLIENT_ID && process.env.BOSA_CLIENT_SECRET) {
    cachedClient = {
      id: process.env.BOSA_CLIENT_ID,
      secret: process.env.BOSA_CLIENT_SECRET,
      realm: process.env.BOSA_AUTH_REALM || "supplier",
      authUrl: `${BOSA_BASE_URL}/auth`,
    };
    return cachedClient;
  }

  const res = await fetch(`${BOSA_BASE_URL}/env.config.js`);
  if (!res.ok) {
    throw new Error(`BOSA: could not fetch env.config.js: HTTP ${res.status}`);
  }
  const text = await res.text();
  const values: Record<string, string> = {};
  for (const match of text.matchAll(CONFIG_JS_PATTERN)) {
    values[match[1]] = match[2];
  }
  const id = process.env.BOSA_CLIENT_ID || values.CLIENTID;
  const secret = process.env.BOSA_CLIENT_SECRET || values.CLIENTSECRET;
  const realm = process.env.BOSA_AUTH_REALM || values.REALM || "supplier";
  const authUrl = values.URL || `${BOSA_BASE_URL}/auth`;
  if (!id || !secret) {
    throw new Error(
      "BOSA: could not discover public client_id/secret from env.config.js — the site's frontend config may have changed shape; set BOSA_CLIENT_ID/BOSA_CLIENT_SECRET to override."
    );
  }
  cachedClient = { id, secret, realm, authUrl };
  return cachedClient;
}

async function fetchToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }
  const client = await discoverClient();
  const tokenUrl = `${client.authUrl}/realms/${client.realm}/protocol/openid-connect/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: client.id,
      client_secret: client.secret,
      scope: "openid profile email",
    }),
  });
  if (!res.ok) {
    throw new Error(`BOSA: token request failed: HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const payload = await res.json();
  if (!payload.access_token) {
    throw new Error(`BOSA: token response missing access_token`);
  }
  const expiresIn = Number(payload.expires_in ?? 300);
  cachedToken = {
    accessToken: payload.access_token,
    // Refresh a bit early to avoid racing expiry mid-request.
    expiresAt: Date.now() + Math.max(expiresIn - 30, 30) * 1000,
  };
  return cachedToken.accessToken;
}

/**
 * GET /api/dos/publication-workspaces/{id} — the workspace envelope (see
 * module docs above for exactly what this does/doesn't carry). Every
 * request must carry a BelGov-Trace-Id header (fresh UUIDv4) — BOSA's
 * gateway rejects requests without one with an opaque HTTP 400.
 */
async function getWorkspaceDetail(workspaceId: string): Promise<Record<string, unknown> | null> {
  const url = `${BOSA_BASE_URL}/api/dos/publication-workspaces/${workspaceId}?includeDrafts=false`;
  const doFetch = async (forceRefresh: boolean) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${await fetchToken(forceRefresh)}`,
        "BelGov-Trace-Id": randomUUID(),
        Accept: "application/json, text/plain, */*",
        "Account-Type": "public",
      },
    });

  let res = await doFetch(false);
  if (res.status === 401 || res.status === 403) {
    res = await doFetch(true);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`BOSA: workspace detail fetch failed: HTTP ${res.status}`);
  }
  return res.json();
}

/** The most recent version carrying the eForms UBL notice, plus its own metadata. */
function findNoticeVersion(
  detail: Record<string, unknown>
): { xmlContent: string | null; publicationDate: string | null } | null {
  const versions = (detail.versions as Record<string, unknown>[] | undefined) ?? [];
  for (const version of versions) {
    const notice = (version.notice as Record<string, unknown> | undefined) ?? {};
    if (typeof notice.xmlContent === "string" && notice.xmlContent) {
      return {
        xmlContent: notice.xmlContent,
        publicationDate:
          (version.activationDate as string | undefined) ?? (version.dispatchDate as string | undefined) ?? null,
      };
    }
  }
  return null;
}

function localName(tag: string): string {
  const idx = tag.indexOf(":");
  return idx === -1 ? tag : tag.slice(idx + 1);
}

/** Direct children of `el` whose local (prefix-stripped) tag name matches. */
function children($: CheerioAPI, el: Element, name: string): Element[] {
  return $(el)
    .children()
    .toArray()
    .filter((c) => localName((c as Element).name) === name) as Element[];
}

function firstChild($: CheerioAPI, el: Element, name: string): Element | null {
  return children($, el, name)[0] ?? null;
}

function attrLocal(el: Element, name: string): string | null {
  const entry = Object.entries(el.attribs ?? {}).find(([attrName]) => localName(attrName) === name);
  return entry ? entry[1] : null;
}

// 3-letter ISO 639-2 codes as used in the XML's languageID attribute,
// mapped to lib/languages.ts's canonical keys so we can reuse its
// aliases table instead of a second hardcoded priority list. Priority
// order mirrors the Python scraper: NL, FR, EN, DE.
const DESCRIPTION_LANG_PRIORITY = ["nl", "fr", "en", "de"];

function langKeyForCode(code: string): string | null {
  const lower = code.toLowerCase();
  const lang = LANGUAGES.find((l) => l.aliases.includes(lower));
  return lang?.key ?? null;
}

/**
 * Picks the best display text among `parent`'s direct children matching
 * `tagName` (there's usually one per language, via a `languageID`
 * attribute) — NL > FR > EN > DE, falling back to whatever's first if
 * none of those match. Shared by title (Name) and description
 * extraction, since eForms models both the same way.
 */
function pickLocalized($: CheerioAPI, parent: Element, tagName: string): string | null {
  const byLangKey = new Map<string, string>();
  let fallback: string | null = null;
  for (const el of children($, parent, tagName)) {
    const text = $(el).text().trim();
    if (!text) continue;
    if (!fallback) fallback = text;
    const langCode = attrLocal(el, "languageID");
    const langKey = langCode ? langKeyForCode(langCode) : null;
    if (langKey && !byLangKey.has(langKey)) byLangKey.set(langKey, text);
  }
  for (const lang of DESCRIPTION_LANG_PRIORITY) {
    const text = byLangKey.get(lang);
    if (text) return text;
  }
  return fallback;
}

/**
 * Which languages `parent`'s direct `tagName` children actually carry text
 * in — the "Published in: NL, FR" hint TenderCard shows via
 * TenderNotice.titleLanguages (see lib/ted.ts's mapOfficialLanguages for
 * the TED equivalent). Unlike pickLocalized above, which picks one winner
 * to display, this reports every language present, in canonical priority
 * order.
 */
function localizedLanguageKeys($: CheerioAPI, parent: Element, tagName: string): string[] {
  const found = new Set<string>();
  for (const el of children($, parent, tagName)) {
    if (!$(el).text().trim()) continue;
    const langCode = attrLocal(el, "languageID");
    const langKey = langCode ? langKeyForCode(langCode) : null;
    if (langKey) found.add(langKey);
  }
  return DESCRIPTION_LANG_PRIORITY.filter((l) => found.has(l));
}

function parseXml(xmlContent: string): { $: CheerioAPI; root: Element } | null {
  let $: CheerioAPI;
  try {
    $ = load(xmlContent, { xmlMode: true });
  } catch {
    return null;
  }
  const root = $.root().children().get(0) as Element | undefined;
  return root ? { $, root } : null;
}

/**
 * Best-effort extraction of the object-of-the-contract description from
 * the eForms UBL XML. Confirmed live against several BOSA notices
 * (ContractNotice and ContractAwardNotice root types alike): the
 * procedure-level description lives at the root's direct-child
 * cac:ProcurementProject/cbc:Description — the same element TED calls
 * description-proc (BT-24(a)). `Description` also appears many other
 * places in the tree (per-lot ProcurementProject, selection/award
 * criteria, location descriptions, ...), so this deliberately only looks
 * at the root-level ProcurementProject, never a bare tag-name search.
 * Never throws — malformed/absent XML yields null, never a guess.
 */
export function extractDescription(xmlContent: string | null): string | null {
  if (!xmlContent) return null;
  const parsed = parseXml(xmlContent);
  if (!parsed) return null;
  const { $, root } = parsed;
  const procurementProject = firstChild($, root, "ProcurementProject");
  return procurementProject ? pickLocalized($, procurementProject, "Description") : null;
}

const VALUE_TAGS = ["EstimatedOverallContractAmount", "TotalAmount"];

interface EstimatedValue {
  amount: number;
  currency: string | null;
}

/** Best-effort estimated-value extraction — most notices simply don't publish one. */
export function extractEstimatedValue(xmlContent: string | null): EstimatedValue | null {
  if (!xmlContent) return null;
  const parsed = parseXml(xmlContent);
  if (!parsed) return null;
  const { $ } = parsed;

  let found: EstimatedValue | null = null;
  $("*").each((_, el) => {
    if (found) return;
    const element = el as Element;
    if (!VALUE_TAGS.includes(localName(element.name))) return;
    const text = $(element).text().trim();
    if (!text) return;
    const amount = Number(text);
    if (isNaN(amount)) return;
    found = { amount, currency: attrLocal(element, "currencyID") };
  });
  return found;
}

export interface NoticeMetadata {
  title: string | null;
  titleLanguages: string[];
  cpvCode: string | null;
  procedureType: string | null;
  /** ISO datetime; deadlines are modeled per-lot in eForms — this is the first lot's, same one-field simplification lib/ted.ts already makes for TED's multi-lot notices. Legitimately null for award/result notices, which don't carry one. */
  deadline: string | null;
  region: string | null;
}

function normalizeXmlDate(raw: string): string | null {
  const m = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function combineXmlDateTime(rawDate: string, rawTime: string | null): string | null {
  const date = normalizeXmlDate(rawDate);
  if (!date) return null;
  if (!rawTime) return date;
  const timeMatch = rawTime.match(/^\d{2}:\d{2}:\d{2}/);
  const offsetMatch = rawDate.match(/([+-]\d{2}:\d{2}|Z)$/) ?? rawTime.match(/([+-]\d{2}:\d{2}|Z)$/);
  const time = timeMatch ? timeMatch[0] : "00:00:00";
  const offset = offsetMatch ? offsetMatch[1] : "";
  return `${date}T${time}${offset}`;
}

/**
 * Extracts the fields the workspace-detail JSON doesn't carry at all
 * (title, CPV, procedure type, deadline, region — see module docs) from
 * the same eForms UBL XML the description comes from. Root-scoped
 * direct-child navigation throughout, same discipline as
 * extractDescription, for the same reason: these tag names recur
 * elsewhere in the tree (per-lot ProcurementProject, per-lot
 * TenderingProcess) and a bare descendant search would risk picking up
 * the wrong one.
 */
export function extractNoticeMetadata(xmlContent: string | null): NoticeMetadata {
  const empty: NoticeMetadata = {
    title: null,
    titleLanguages: [],
    cpvCode: null,
    procedureType: null,
    deadline: null,
    region: null,
  };
  if (!xmlContent) return empty;
  const parsed = parseXml(xmlContent);
  if (!parsed) return empty;
  const { $, root } = parsed;

  const procurementProject = firstChild($, root, "ProcurementProject");
  const title = procurementProject ? pickLocalized($, procurementProject, "Name") : null;
  const titleLanguages = procurementProject ? localizedLanguageKeys($, procurementProject, "Name") : [];

  let cpvCode: string | null = null;
  let region: string | null = null;
  if (procurementProject) {
    const mainCommodity = firstChild($, procurementProject, "MainCommodityClassification");
    const codeEl = mainCommodity ? firstChild($, mainCommodity, "ItemClassificationCode") : null;
    cpvCode = codeEl ? $(codeEl).text().trim() || null : null;

    const nutsCodes = Array.from(
      new Set(
        children($, procurementProject, "RealizedLocation").flatMap((loc) => {
          const address = firstChild($, loc, "Address");
          const nutsEl = address ? firstChild($, address, "CountrySubentityCode") : null;
          const text = nutsEl ? $(nutsEl).text().trim() : "";
          return text ? [text] : [];
        })
      )
    );
    region = nutsCodes.length ? nutsCodes.join(", ") : null;
  }

  const rootTenderingProcess = firstChild($, root, "TenderingProcess");
  const procedureCodeEl = rootTenderingProcess ? firstChild($, rootTenderingProcess, "ProcedureCode") : null;
  const procedureType = procedureCodeEl ? $(procedureCodeEl).text().trim() || null : null;

  let deadline: string | null = null;
  for (const lot of children($, root, "ProcurementProjectLot")) {
    const lotProcess = firstChild($, lot, "TenderingProcess");
    const period = lotProcess ? firstChild($, lotProcess, "TenderSubmissionDeadlinePeriod") : null;
    if (!period) continue;
    const endDateEl = firstChild($, period, "EndDate");
    if (!endDateEl) continue;
    const endTimeEl = firstChild($, period, "EndTime");
    deadline = combineXmlDateTime($(endDateEl).text().trim(), endTimeEl ? $(endTimeEl).text().trim() : null);
    break;
  }

  return { title, titleLanguages, cpvCode, procedureType, deadline, region };
}

function formatValue(ev: EstimatedValue | null): { text: string | null; raw: number | null } {
  if (!ev) return { text: null, raw: null };
  const currency = ev.currency ?? "EUR";
  return {
    text: `≈ ${currency} ${new Intl.NumberFormat("en-BE").format(ev.amount)}`,
    raw: ev.amount,
  };
}

interface TextEntry {
  language?: string;
  text?: string;
}

const JSON_LANG_PRIORITY = ["NL", "FR", "EN", "DE"];

function pickJsonText(items: TextEntry[] | undefined): string | null {
  if (!items?.length) return null;
  const byLang = new Map(items.filter((i) => i.text).map((i) => [i.language, i.text as string]));
  for (const lang of JSON_LANG_PRIORITY) {
    const text = byLang.get(lang);
    if (text) return text;
  }
  const first = byLang.values().next();
  return first.done ? null : first.value;
}

/** Same idea as localizedLanguageKeys above, for the search endpoint's flat `{language, text}[]` shape instead of XML elements. */
function jsonLanguageKeys(items: TextEntry[] | undefined): string[] {
  if (!items?.length) return [];
  const found = new Set<string>();
  for (const item of items) {
    if (!item.text || !item.language) continue;
    const langKey = langKeyForCode(item.language);
    if (langKey) found.add(langKey);
  }
  return DESCRIPTION_LANG_PRIORITY.filter((l) => found.has(l));
}

const BOSA_SEARCH_URL = `${BOSA_BASE_URL}/api/sea/search/publications`;

/**
 * Live search against BOSA's own listing endpoint — the "separate, not-
 * yet-built feature" this module's header comment originally flagged.
 * Unlike getBosaTenderById, this deliberately does NOT fetch each result's
 * detail/XML (that's one request per row — fine for a single tender, far
 * too slow for a list on every Opportunities page load): title, buyer,
 * CPV, dispatch date, and deadline are all already present on the search
 * response itself (confirmed against the sibling Python scraper's
 * normalize.py, which normalizes a "prelim" record from the exact same
 * raw search item before ever fetching a detail page). Belgium's national
 * publication threshold is lower than TED's EU threshold, so this
 * necessarily overlaps with some TED results — dedup against TED is not
 * attempted here; see the regional-sources dedup work in the sibling
 * scraper project for why that's a separate, harder problem than it looks.
 */
export async function searchBosaTenders(
  params: {
    keyword?: string;
    limit?: number;
    onlyOpenCalls?: boolean;
    /** Same contract as lib/ted.ts's filterLanguageKeys: matched against each
     * notice's titleLanguages (parsed from its multilingual title fields,
     * below), not merely used for display priority. A notice with no
     * titleLanguages on file is excluded, same as TED's version. */
    filterLanguageKeys?: string[];
    /** Same contract as lib/ted.ts's cpvPrefixes (lib/sectors.ts's SECTORS
     * flattened), matched against each notice's cpvMainCode. Unlike TED, the
     * BOSA search endpoint's query shape has no documented CPV/OR support, so
     * this is applied client-side, same as filterLanguageKeys below. */
    cpvPrefixes?: string[];
  } = {}
): Promise<TenderNotice[]> {
  const displayLimit = params.limit ?? 30;
  // Mirrors lib/ted.ts's onlyOpenCalls overfetch: filtering happens
  // client-side after the request, so ask BOSA for more than we'll show.
  // Confirmed live (2026-08-23, 50-record sample) that award notices and
  // other already-decided notices (e.g. "avis d'attribution",
  // noticeSubType E4/29/33 — negotiated-without-publication results,
  // ex-ante transparency notices) never carry vaultSubmissionDeadline,
  // while every open-call notice sampled did — same signal the mapping
  // below already used for the `deadline` field, just applied as a filter.
  // That signal alone isn't enough, though: the search endpoint ranks by
  // keyword relevance, not recency, so it freely surfaces notices whose
  // deadline has already passed. Confirmed live 2026-08-23 — a "vertalingen"
  // search with onlyOpenCalls:true returned 30/30 results with a past
  // deadline, none actually biddable — so the deadline must also still be
  // in the future, not merely present.
  const needsOverfetch = params.onlyOpenCalls || params.filterLanguageKeys?.length || params.cpvPrefixes?.length;
  const pageSize = needsOverfetch ? Math.max(displayLimit * 3, 90) : displayLimit;
  const doFetch = async (forceRefresh: boolean) =>
    fetch(BOSA_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await fetchToken(forceRefresh)}`,
        "BelGov-Trace-Id": randomUUID(),
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "Account-Type": "public",
      },
      body: JSON.stringify({
        terms: params.keyword ?? "",
        includeOrganisationChildren: true,
        page: 1,
        pageSize,
      }),
      next: { revalidate: 300 },
    });

  let res = await doFetch(false);
  if (res.status === 401 || res.status === 403) {
    res = await doFetch(true);
  }
  if (!res.ok) {
    throw new Error(`BOSA: search failed: HTTP ${res.status}`);
  }
  const body = await res.json();
  let publications = (body.publications as Record<string, unknown>[] | undefined) ?? [];

  if (params.onlyOpenCalls) {
    const now = Date.now();
    publications = publications.filter((raw) => {
      const deadline = raw.vaultSubmissionDeadline as string | undefined;
      if (!deadline) return false;
      const deadlineMs = new Date(deadline).getTime();
      if (isNaN(deadlineMs) || deadlineMs <= now) return false;
      // Closed-shortlist exclusion, BOSA's own structured equivalent of the
      // Wallonia/Flanders text-marker filters in lib/externalOpportunities.ts
      // (see NEGOTIATED_WITHOUT_PUBLICATION_MARKERS there) - every BOSA
      // notice carries dossier.procurementProcedureType, a first-party
      // eForms classification code, language-independent unlike title text.
      // Confirmed live 2026-08-23 against a 900-record sample: values
      // starting "NEG_WO_CALL" ("negotiated, WithOut a public Call") were
      // 241/900 (27%) and every title/description sampled read exactly like
      // the Wallonia/Flanders closed-shortlist cases ("Onderhandelingsprocedure
      // zonder voorafgaande bekendmaking" / "Procédure négociée sans
      // publication préalable") - a pre-chosen list of firms invited
      // directly, nothing for an outside company to bid into. The "W_CALL"
      // (with a call) and plain "OPEN"/"OPEN_DEF"/"OPEN_CONS" variants are
      // genuinely open and left untouched; the small residual categories
      // (LOW_VALUE_T, SUIGEN_OTHER, missing type - together <2% of the
      // sample) were spot-checked and left alone: LOW_VALUE_T is 13/900
      // and 12 of those already lack a deadline entirely (excluded above
      // regardless), too small and ambiguous a bucket to build a rule for.
      const dossier = raw.dossier as Record<string, unknown> | undefined;
      const procedureType = dossier?.procurementProcedureType as string | undefined;
      if (procedureType?.startsWith("NEG_WO_CALL")) return false;
      return true;
    });
  }

  let notices = publications
    .map((raw): TenderNotice | null => {
      const workspaceId = raw.publicationWorkspaceId as string | undefined;
      if (!workspaceId) return null;
      const dossier = (raw.dossier as Record<string, unknown> | undefined) ?? {};
      const organisation = (raw.organisation as Record<string, unknown> | undefined) ?? {};
      const cpvMainCode = (raw.cpvMainCode as { code?: string } | undefined)?.code;
      const title = pickJsonText(dossier.titles as TextEntry[] | undefined);
      if (!title) return null;

      return {
        publicationNumber: `BOSA:${workspaceId}`,
        title,
        buyerName: pickJsonText(organisation.organisationNames as TextEntry[] | undefined) ?? "Unknown buyer",
        buyerCountry: "BEL",
        totalValue: null,
        totalValueRaw: null,
        // The search API omits this field entirely for notices with no
        // deadline (e.g. award notices) rather than sending null - both
        // read the same way here.
        deadline: (raw.vaultSubmissionDeadline as string | undefined) ?? null,
        publicationDate: (raw.dispatchDate as string | undefined) ?? null,
        cpvCodes: cpvMainCode ? [cpvMainCode] : [],
        titleLanguages: jsonLanguageKeys(dossier.titles as TextEntry[] | undefined),
        url: `${BOSA_BASE_URL}/publication-workspaces/${workspaceId}`,
      };
    })
    .filter((t): t is TenderNotice => t !== null);

  if (params.cpvPrefixes?.length) {
    const prefixes = params.cpvPrefixes;
    notices = notices.filter((t) => t.cpvCodes.some((code) => prefixes.some((p) => code.startsWith(p))));
  }

  if (params.filterLanguageKeys?.length) {
    const wanted = params.filterLanguageKeys;
    // A notice with no titleLanguages on file can't be confirmed to match,
    // so it's excluded too — same "certainty over completeness" contract as
    // lib/ted.ts's filterLanguageKeys.
    notices = notices.filter((t) => t.titleLanguages.some((l) => wanted.includes(l)));
  }

  return notices.slice(0, displayLimit);
}

/**
 * Fetches a single BOSA notice by workspace id for the detail page.
 * Mirrors lib/ted.ts's getTenderById shape/contract — null on not-found,
 * throws on a genuine transport/auth failure so the caller can log it.
 */
export async function getBosaTenderById(workspaceId: string): Promise<TenderDetail | null> {
  const detail = await getWorkspaceDetail(workspaceId);
  if (!detail) return null;

  const buyerName = pickJsonText(detail.organisationNames as TextEntry[] | undefined) ?? "Unknown buyer";

  const version = findNoticeVersion(detail);
  const xmlContent = version?.xmlContent ?? null;
  const description = extractDescription(xmlContent);
  const value = formatValue(extractEstimatedValue(xmlContent));
  const meta = extractNoticeMetadata(xmlContent);

  return {
    publicationNumber: `BOSA:${workspaceId}`,
    title: meta.title ?? "Untitled notice",
    buyerName,
    buyerCountry: "BEL",
    totalValue: value.text,
    totalValueRaw: value.raw,
    deadline: meta.deadline,
    publicationDate: version?.publicationDate ?? null,
    cpvCodes: meta.cpvCode ? [meta.cpvCode] : [],
    titleLanguages: meta.titleLanguages,
    url: `${BOSA_BASE_URL}/publication-workspaces/${workspaceId}`,
    sourceName: "BOSA e-Notification",
    description,
    procedureType: meta.procedureType,
    region: meta.region,
    // Direct per-file download links require an authenticated BOSA
    // account (confirmed HTTP 403 for the anonymous public token) — link
    // to the notice's own public documents tab instead of a guessed URL.
    documentUrls: [`${BOSA_BASE_URL}/publication-workspaces/${workspaceId}/documents`],
  };
}
