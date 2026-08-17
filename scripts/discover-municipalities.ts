// One-off research script for TenderProc's below-threshold municipal tender
// discovery sprint (Phase 1). Not part of the deployed app — run manually via:
//   npx tsx scripts/discover-municipalities.ts
//
// Reads scripts/discovery/seed.json ({name, region, province, population,
// websiteUrl}), fetches each municipality's site, looks for a tenders/
// procurement page, and classifies what it finds. Writes
// scripts/discovery/output/municipalities.json and .csv.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { load } from "cheerio";

const SEED_PATH = "scripts/discovery/seed.json";
const OUTPUT_DIR = "scripts/discovery/output";

// Identifies this research script to small municipal servers, with a real
// contact so an admin who notices it can reach out — deliberately different
// from lib/ted.ts's convention (no User-Agent at all), which is fine for a
// robust EU-funded API but not appropriate here.
const USER_AGENT =
  "TenderProcDiscoveryBot/0.1 (research sprint, low volume, contact: youssouf.albaljiki@gmail.com)";

const REQUEST_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 15000;

// French / Dutch terms for a tenders/procurement page, per the user's spec.
const TENDER_KEYWORDS = [
  "marchés publics", "marches publics", "marché public", "marche public",
  "avis de marché", "avis de marche", "appel d'offres", "appel doffres",
  "overheidsopdrachten", "overheidsopdracht",
  "aanbestedingen", "aanbesteding",
  "openbare aanbesteding",
];

// Common URL path guesses, cross-checked against sitemap.xml and nav links —
// Ghent's spot-check during planning showed nav-only discovery isn't enough.
const COMMON_PATHS = [
  "/marches-publics", "/marches-publics-et-appels-doffres", "/appels-doffres",
  "/overheidsopdrachten", "/aanbestedingen", "/openbare-aanbestedingen",
];

interface SeedMunicipality {
  name: string;
  region: string;
  province: string | null;
  population: number;
  websiteUrl: string;
}

interface MunicipalityRecord extends SeedMunicipality {
  populationTier: 1 | 2 | 3 | 4;
  tenderPageUrl: string | null;
  publicationFormat:
    | "rss" | "html-table" | "html-list" | "pdf-only"
    | "embedded-widget" | "none" | "unknown";
  detectedPlatform: string | null;
  platformSignals: string[];
  automationDifficulty: 1 | 2 | 3 | 4 | 5;
  notes: string;
  checkedAt: string;
}

function populationTier(population: number): 1 | 2 | 3 | 4 {
  if (population > 100000) return 1;
  if (population > 20000) return 2;
  if (population > 5000) return 3;
  return 4;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string): Promise<{ status: number; text: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return { status: res.status, text: "" };
    return { status: res.status, text: await res.text() };
  } catch {
    return null;
  }
}

function findTenderPageUrl(
  baseUrl: string,
  homepageHtml: string,
  sitemapHtml: string | null
): { url: string | null; matchedText: string | null } {
  const $ = load(homepageHtml);
  const candidates: { href: string; text: string }[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim().toLowerCase();
    candidates.push({ href, text });
  });

  if (sitemapHtml) {
    const $sitemap = load(sitemapHtml, { xmlMode: true });
    $sitemap("loc").each((_, el) => {
      const href = $sitemap(el).text().trim();
      candidates.push({ href, text: href.toLowerCase() });
    });
  }

  for (const { href, text } of candidates) {
    const combined = `${text} ${href.toLowerCase()}`;
    const matched = TENDER_KEYWORDS.find((kw) => combined.includes(kw));
    if (matched) {
      try {
        return { url: new URL(href, baseUrl).toString(), matchedText: matched };
      } catch {
        continue;
      }
    }
  }

  return { url: null, matchedText: null };
}

async function tryCommonPaths(baseUrl: string): Promise<string | null> {
  for (const path of COMMON_PATHS) {
    const url = new URL(path, baseUrl).toString();
    const result = await fetchText(url);
    if (result && result.status === 200) return url;
    await sleep(200);
  }
  return null;
}

function classifyTenderPage(html: string): {
  format: MunicipalityRecord["publicationFormat"];
  platform: string | null;
  signals: string[];
} {
  const $ = load(html);
  const signals: string[] = [];

  const generator = $('meta[name="generator"]').attr("content");
  if (generator) signals.push(`meta-generator:${generator}`);

  const iframe = $("iframe[src]").first().attr("src");
  if (iframe) {
    try {
      const domain = new URL(iframe, "https://placeholder.invalid").hostname;
      signals.push(`iframe-src-domain:${domain}`);
      return { format: "embedded-widget", platform: domain, signals };
    } catch {
      signals.push(`iframe-src:${iframe}`);
    }
  }

  const pdfLinkCount = $('a[href$=".pdf"]').length;
  const tableCount = $("table").length;
  const listItemCount = $("ul li, ol li").length;

  if (pdfLinkCount > 0 && tableCount === 0 && listItemCount < 3) {
    signals.push(`pdf-link-count:${pdfLinkCount}`);
    return { format: "pdf-only", platform: null, signals };
  }
  if (tableCount > 0) {
    signals.push(`table-count:${tableCount}`);
    return { format: "html-table", platform: null, signals };
  }
  if (listItemCount >= 3) {
    signals.push(`list-item-count:${listItemCount}`);
    return { format: "html-list", platform: null, signals };
  }

  return { format: "unknown", platform: null, signals };
}

function automationDifficulty(
  format: MunicipalityRecord["publicationFormat"]
): 1 | 2 | 3 | 4 | 5 {
  switch (format) {
    case "rss": return 1;
    case "html-table": case "html-list": return 2;
    case "pdf-only": return 4;
    case "embedded-widget": return 4;
    case "unknown": return 3;
    case "none": return 5;
  }
}

async function discoverOne(seed: SeedMunicipality): Promise<MunicipalityRecord> {
  const base: Omit<
    MunicipalityRecord,
    "tenderPageUrl" | "publicationFormat" | "detectedPlatform" | "platformSignals" | "automationDifficulty" | "notes"
  > = {
    ...seed,
    populationTier: populationTier(seed.population),
    checkedAt: new Date().toISOString().slice(0, 10),
  };

  const homepage = await fetchText(seed.websiteUrl);
  if (!homepage || homepage.status !== 200) {
    return {
      ...base,
      tenderPageUrl: null,
      publicationFormat: "unknown",
      detectedPlatform: null,
      platformSignals: [],
      automationDifficulty: automationDifficulty("unknown"),
      notes: homepage
        ? `Homepage returned HTTP ${homepage.status}`
        : "Homepage fetch failed (network error or timeout)",
    };
  }

  await sleep(REQUEST_DELAY_MS);
  const sitemap = await fetchText(new URL("/sitemap.xml", seed.websiteUrl).toString());
  const sitemapHtml = sitemap && sitemap.status === 200 ? sitemap.text : null;

  const { url: matchedTenderPageUrl, matchedText } = findTenderPageUrl(
    seed.websiteUrl,
    homepage.text,
    sitemapHtml
  );
  let tenderPageUrl = matchedTenderPageUrl;

  if (!tenderPageUrl) {
    await sleep(REQUEST_DELAY_MS);
    tenderPageUrl = await tryCommonPaths(seed.websiteUrl);
  }

  if (!tenderPageUrl) {
    return {
      ...base,
      tenderPageUrl: null,
      publicationFormat: "none",
      detectedPlatform: null,
      platformSignals: [],
      automationDifficulty: automationDifficulty("none"),
      notes: "No tender/procurement page found via nav links, sitemap, or common path guesses.",
    };
  }

  await sleep(REQUEST_DELAY_MS);
  const tenderPage = await fetchText(tenderPageUrl);
  if (!tenderPage || tenderPage.status !== 200) {
    return {
      ...base,
      tenderPageUrl,
      publicationFormat: "unknown",
      detectedPlatform: null,
      platformSignals: [],
      automationDifficulty: automationDifficulty("unknown"),
      notes: `Found a candidate tender page URL but it returned ${tenderPage ? `HTTP ${tenderPage.status}` : "a fetch error"}.`,
    };
  }

  const { format, platform, signals } = classifyTenderPage(tenderPage.text);
  return {
    ...base,
    tenderPageUrl,
    publicationFormat: format,
    detectedPlatform: platform,
    platformSignals: signals,
    automationDifficulty: automationDifficulty(format),
    notes: matchedText
      ? `Tender page found via link/sitemap match on "${matchedText}".`
      : "Tender page found via common-path guess (no matching nav link or sitemap entry).",
  };
}

function toCsvRow(r: MunicipalityRecord): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    r.name, r.region, r.province ?? "", r.population, r.populationTier,
    r.websiteUrl, r.tenderPageUrl ?? "", r.publicationFormat,
    r.detectedPlatform ?? "", r.platformSignals.join("; "),
    r.automationDifficulty, r.notes, r.checkedAt,
  ].map(esc).join(",");
}

async function main() {
  const seeds: SeedMunicipality[] = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const results: MunicipalityRecord[] = [];

  for (const seed of seeds) {
    process.stdout.write(`Checking ${seed.name}... `);
    try {
      const record = await discoverOne(seed);
      results.push(record);
      console.log(`${record.publicationFormat} (difficulty ${record.automationDifficulty})`);
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        ...seed,
        populationTier: populationTier(seed.population),
        tenderPageUrl: null,
        publicationFormat: "unknown",
        detectedPlatform: null,
        platformSignals: [],
        automationDifficulty: 3,
        notes: `Script error: ${err instanceof Error ? err.message : String(err)}`,
        checkedAt: new Date().toISOString().slice(0, 10),
      });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(`${OUTPUT_DIR}/municipalities.json`, JSON.stringify(results, null, 2));

  const header = "name,region,province,population,populationTier,websiteUrl,tenderPageUrl,publicationFormat,detectedPlatform,platformSignals,automationDifficulty,notes,checkedAt";
  const csv = [header, ...results.map(toCsvRow)].join("\n");
  writeFileSync(`${OUTPUT_DIR}/municipalities.csv`, csv);

  console.log(`\nDone. ${results.length} municipalities written to ${OUTPUT_DIR}/municipalities.{json,csv}`);
}

main();
