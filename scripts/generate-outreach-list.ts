// Generates a sales-outreach CSV of companies that have WON public tenders
// in Belgium before, in one or more of lib/sectors.ts's sectors, matched
// against the kbo_companies registry for a verified name + enterprise
// number, and cross-referenced against currently open tenders (TED, BOSA,
// and the regional external_opportunities table) in the same sector so
// each row carries a ready-made outreach hook: "you won X before, here are
// tenders you'd likely qualify for today."
//
// Not part of the deployed app — a one-off/occasional manual pull for
// building an outreach list. Run via:
//
//   npx tsx scripts/generate-outreach-list.ts [--sectors=construction,it-telecom] [--months=24] [--limit=100] [--out=outreach-list.csv] [--env-file=.env.local]
//
// Data sources (see supabase-contract-awards-migration.sql /
// supabase-external-opportunities-migration.sql / lib/sectors.ts):
//   - contract_awards: past award/winner data (TED + regional "awarded" rows)
//   - kbo_companies: Belgium's company registry, via the search_kbo_companies RPC
//   - external_opportunities (notice_kind='open') + live TED/BOSA search: open tenders today

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ScriptExit, loadEnvFile, requireEnv } from "./lib/scriptEnv";
import { guessLanguage } from "./lib/guessLanguage";
import { SECTORS, sectorsToCpvPrefixes } from "../lib/sectors";
import { normalizeCompanyName } from "../lib/companies/normalize";
import { searchBelgianTenders } from "../lib/ted";
import { searchBosaTenders } from "../lib/bosa";
import type { TenderNotice } from "../lib/types";
import { writeFileSync } from "node:fs";

// ---------- CLI args ----------

const args = process.argv.slice(2);
function argValue(flag: string, fallback: string): string {
  const found = args.find((a) => a.startsWith(`--${flag}=`));
  return found ? found.slice(flag.length + 3) : fallback;
}

const envFile = argValue("env-file", ".env.local");
const sectorKeysArg = argValue("sectors", "construction,it-telecom");
const lookbackMonths = Number(argValue("months", "24"));
const companyLimit = Number(argValue("limit", "100"));
const outPath = argValue("out", "outreach-list.csv");

const sectorKeys = sectorKeysArg.split(",").map((s) => s.trim()).filter(Boolean);

// ---------- Types ----------

interface AwardRow {
  source: string;
  source_reference: string;
  contracting_authority: string;
  cpv_codes: string[];
  award_date: string | null;
  winner_name: string | null;
  winner_country: string | null;
  award_value: number | null;
  award_value_currency: string | null;
  source_url: string;
  raw_title: string | null;
}

interface ExternalOpportunityRow {
  title: string;
  buyer_name: string | null;
  cpv_codes: string[];
  deadline: string | null;
  publication_date: string | null;
  source_url: string;
}

interface OpenTender {
  title: string;
  buyerName: string | null;
  cpvCodes: string[];
  deadline: string | null;
  url: string;
  source: string;
}

interface CompanyGroup {
  normalizedName: string;
  rawNames: Set<string>;
  wins: AwardRow[];
  cpvCodesWon: Set<string>;
}

interface KboMatch {
  confidence: "confirmed" | "possible" | "unmatched";
  denomination: string | null;
  enterpriseNumber: string | null;
}

// ---------- Helpers ----------

// Semicolon-delimited, not comma: Excel on a Dutch/Belgian Windows locale
// uses ";" as its CSV list separator, so double-clicking a comma-delimited
// file dumps every row into column A instead of splitting it. Commas
// within a field (e.g. "IT, software & telecom") no longer need quoting
// as a result, but still get quoted for clarity alongside real delimiters.
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[;",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function cpvPrefixMatches(codes: string[], prefixes: string[]): boolean {
  return codes.some((code) => prefixes.some((prefix) => code.startsWith(prefix)));
}

function sectorLabelFor(cpvCodes: string[]): string {
  const sector = SECTORS.find((s) => s.cpvPrefixes.some((p) => cpvCodes.some((c) => c.startsWith(p))));
  return sector?.label ?? "Other";
}

function linkedInSearchUrl(companyName: string): string {
  return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`;
}

function tenderMatchScore(wonCpv: Set<string>, tender: OpenTender): number {
  let score = 0;
  for (const code of tender.cpvCodes) {
    if (wonCpv.has(code)) score = Math.max(score, 3);
    else if ([...wonCpv].some((w) => w.slice(0, 2) === code.slice(0, 2))) score = Math.max(score, 2);
  }
  return score || 1; // already sector-filtered, so baseline relevance is 1
}

async function main() {
  loadEnvFile(envFile);
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", envFile);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", envFile);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const invalidSectors = sectorKeys.filter((k) => !SECTORS.some((s) => s.key === k));
  if (invalidSectors.length) {
    throw new ScriptExit(
      `Unknown sector key(s): ${invalidSectors.join(", ")}. Valid keys: ${SECTORS.map((s) => s.key).join(", ")}`
    );
  }
  const cpvPrefixes = sectorsToCpvPrefixes(sectorKeys);
  console.log(`Sectors: ${sectorKeys.join(", ")} (CPV prefixes: ${cpvPrefixes.join(", ")})`);

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  // ---------- 1. Past winners ----------

  console.log(`Fetching contract_awards since ${cutoffIso}...`);
  // Supabase/PostgREST silently caps a single request's rows (observed at
  // 1000 on this project, regardless of the .range() upper bound
  // requested) — page through in batches until a page comes back short,
  // or an unbounded 24-month window would silently lose the older 70% of
  // matching rows behind the newest 1000.
  const pageSize = 1000;
  const awards: AwardRow[] = [];
  for (let page = 0; ; page++) {
    const { data: awardRows, error: awardErr } = await supabase
      .from("contract_awards")
      .select(
        "source, source_reference, contracting_authority, cpv_codes, award_date, winner_name, winner_country, award_value, award_value_currency, source_url, raw_title"
      )
      .not("winner_name", "is", null)
      .gte("award_date", cutoffIso)
      .order("award_date", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (awardErr) throw new ScriptExit(`contract_awards query failed: ${awardErr.message}`);
    const rows = (awardRows ?? []) as AwardRow[];
    awards.push(...rows);
    if (rows.length < pageSize) break;
  }
  const sectorAwards = awards.filter((a) => cpvPrefixMatches(a.cpv_codes ?? [], cpvPrefixes));
  console.log(`${awards.length} awards in window, ${sectorAwards.length} match the selected sector(s).`);

  // ---------- 2. Group by normalized winner name ----------

  const groups = new Map<string, CompanyGroup>();
  for (const award of sectorAwards) {
    const normalized = normalizeCompanyName(award.winner_name);
    if (!normalized) continue;
    let group = groups.get(normalized);
    if (!group) {
      group = { normalizedName: normalized, rawNames: new Set(), wins: [], cpvCodesWon: new Set() };
      groups.set(normalized, group);
    }
    group.rawNames.add(award.winner_name!.trim());
    group.wins.push(award);
    for (const code of award.cpv_codes ?? []) group.cpvCodesWon.add(code);
  }

  const sortedGroups = [...groups.values()]
    .sort((a, b) => {
      if (b.wins.length !== a.wins.length) return b.wins.length - a.wins.length;
      const aDate = a.wins[0]?.award_date ?? "";
      const bDate = b.wins[0]?.award_date ?? "";
      return bDate.localeCompare(aDate);
    })
    .slice(0, companyLimit);

  console.log(`${groups.size} distinct companies found, keeping top ${sortedGroups.length} by win count/recency.`);

  // ---------- 3. Match against kbo_companies ----------

  console.log("Matching companies against kbo_companies (search_kbo_companies RPC)...");
  const kboMatches = new Map<string, KboMatch>();
  for (const group of sortedGroups) {
    const bestRawName = [...group.rawNames][0];
    const { data: candidates, error: rpcErr } = await supabase.rpc("search_kbo_companies", {
      search_query: bestRawName,
      result_limit: 5,
    });
    if (rpcErr) {
      console.warn(`  KBO lookup failed for "${bestRawName}": ${rpcErr.message}`);
      kboMatches.set(group.normalizedName, { confidence: "unmatched", denomination: null, enterpriseNumber: null });
      continue;
    }
    const rows = (candidates ?? []) as { enterprise_number: string; denomination: string }[];
    const exact = rows.find((r) => normalizeCompanyName(r.denomination) === group.normalizedName);
    if (exact) {
      kboMatches.set(group.normalizedName, {
        confidence: "confirmed",
        denomination: exact.denomination,
        enterpriseNumber: exact.enterprise_number,
      });
    } else if (rows.length) {
      kboMatches.set(group.normalizedName, {
        confidence: "possible",
        denomination: rows[0].denomination,
        enterpriseNumber: rows[0].enterprise_number,
      });
    } else {
      kboMatches.set(group.normalizedName, { confidence: "unmatched", denomination: null, enterpriseNumber: null });
    }
  }
  const matchCounts = { confirmed: 0, possible: 0, unmatched: 0 };
  for (const m of kboMatches.values()) matchCounts[m.confidence]++;
  console.log(`KBO matches: ${matchCounts.confirmed} confirmed, ${matchCounts.possible} possible, ${matchCounts.unmatched} unmatched.`);

  // ---------- 4. Open tenders to cross-reference ----------

  console.log("Fetching currently open tenders (external_opportunities + live TED/BOSA)...");
  const todayIso = new Date().toISOString().slice(0, 10);
  const openTenders: OpenTender[] = [];

  for (let page = 0; ; page++) {
    const { data: extRows, error: extErr } = await supabase
      .from("external_opportunities")
      .select("title, buyer_name, cpv_codes, deadline, publication_date, source_url")
      .eq("notice_kind", "open")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (extErr) {
      console.warn(`  external_opportunities query failed: ${extErr.message}`);
      break;
    }
    const rows = (extRows ?? []) as ExternalOpportunityRow[];
    for (const row of rows) {
      if (row.deadline && row.deadline < todayIso) continue;
      if (!cpvPrefixMatches(row.cpv_codes ?? [], cpvPrefixes)) continue;
      openTenders.push({
        title: row.title,
        buyerName: row.buyer_name,
        cpvCodes: row.cpv_codes ?? [],
        deadline: row.deadline,
        url: row.source_url,
        source: "regional",
      });
    }
    if (rows.length < pageSize) break;
  }

  try {
    // TED's own API caps at limit=250; searchBelgianTenders internally
    // overfetches by 4x (max(displayLimit*4, 100)) when onlyOpenCalls is
    // set, so displayLimit must stay <= 62 to avoid a 400 from TED.
    const tedResults = await searchBelgianTenders({ cpvPrefixes, onlyOpenCalls: true, limit: 60 });
    for (const t of tedResults as TenderNotice[]) {
      openTenders.push({
        title: t.title,
        buyerName: t.buyerName ?? null,
        cpvCodes: t.cpvCodes ?? [],
        deadline: t.deadline ?? null,
        url: t.url,
        source: "ted",
      });
    }
  } catch (err) {
    console.warn(`  Live TED search failed, continuing without it: ${(err as Error).message}`);
  }

  try {
    const bosaResults = await searchBosaTenders({ cpvPrefixes, onlyOpenCalls: true, limit: 100 });
    for (const t of bosaResults as TenderNotice[]) {
      openTenders.push({
        title: t.title,
        buyerName: t.buyerName ?? null,
        cpvCodes: t.cpvCodes ?? [],
        deadline: t.deadline ?? null,
        url: t.url,
        source: "bosa",
      });
    }
  } catch (err) {
    console.warn(`  Live BOSA search failed, continuing without it: ${(err as Error).message}`);
  }

  console.log(`${openTenders.length} open tenders in the selected sector(s) to cross-reference against.`);

  // ---------- 5. Build CSV rows ----------

  const header = [
    "company_name",
    "match_confidence",
    "enterprise_number",
    "sector",
    "past_wins_count",
    "most_recent_win_title",
    "most_recent_win_buyer",
    "most_recent_win_date",
    "most_recent_win_value",
    "most_recent_win_url",
    "open_tender_1_title",
    "open_tender_1_deadline",
    "open_tender_1_url",
    "open_tender_2_title",
    "open_tender_2_deadline",
    "open_tender_2_url",
    "open_tender_3_title",
    "open_tender_3_deadline",
    "open_tender_3_url",
    "linkedin_search_url",
    "language", // fill in en/fr/nl per company (blank defaults to fr in generate-outreach-messages.ts)
    "contact_name",
    "contact_email",
    "contact_linkedin",
    "outreach_status",
    "notes",
  ];

  const lines = [header.join(";")];

  for (const group of sortedGroups) {
    const match = kboMatches.get(group.normalizedName)!;
    if (match.confidence === "unmatched") continue; // no verified identity, skip from the outreach list itself

    const companyName = match.denomination ?? [...group.rawNames][0];
    const mostRecentWin = group.wins[0];
    const sector = sectorLabelFor([...group.cpvCodesWon]);

    const matchedTenders = openTenders
      .filter((t) => cpvPrefixMatches(t.cpvCodes, [...group.cpvCodesWon].map((c) => c.slice(0, 2))))
      .map((t) => ({ t, score: tenderMatchScore(group.cpvCodesWon, t) }))
      .sort((a, b) => b.score - a.score || (a.t.deadline ?? "9999").localeCompare(b.t.deadline ?? "9999"))
      .slice(0, 3)
      .map((x) => x.t);

    const row = [
      csvEscape(companyName),
      csvEscape(match.confidence),
      csvEscape(match.enterpriseNumber),
      csvEscape(sector),
      csvEscape(group.wins.length),
      csvEscape(mostRecentWin.raw_title ?? ""),
      csvEscape(mostRecentWin.contracting_authority),
      csvEscape(mostRecentWin.award_date),
      csvEscape(mostRecentWin.award_value ? `${mostRecentWin.award_value} ${mostRecentWin.award_value_currency ?? ""}` : ""),
      csvEscape(mostRecentWin.source_url),
      csvEscape(matchedTenders[0]?.title ?? ""),
      csvEscape(matchedTenders[0]?.deadline ?? ""),
      csvEscape(matchedTenders[0]?.url ?? ""),
      csvEscape(matchedTenders[1]?.title ?? ""),
      csvEscape(matchedTenders[1]?.deadline ?? ""),
      csvEscape(matchedTenders[1]?.url ?? ""),
      csvEscape(matchedTenders[2]?.title ?? ""),
      csvEscape(matchedTenders[2]?.deadline ?? ""),
      csvEscape(matchedTenders[2]?.url ?? ""),
      csvEscape(linkedInSearchUrl(companyName)),
      csvEscape(
        guessLanguage(
          [companyName, mostRecentWin.contracting_authority, mostRecentWin.raw_title ?? "", ...matchedTenders.flatMap((t) => [t.title, t.buyerName ?? ""])].join(" ")
        )
      ), // best-effort NL/FR guess from buyer/title vocabulary; blank means ambiguous, verify manually
      "",
      "",
      "",
      "not started",
      csvEscape(match.confidence === "possible" ? "KBO match is a best guess — verify before outreach" : ""),
    ];
    lines.push(row.join(";"));
  }

  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\nWrote ${lines.length - 1} companies to ${outPath}.`);
  console.log(`(${matchCounts.unmatched} additional companies had no KBO match and were left out — mostly non-Belgian winners or name-variant mismatches.)`);
}

main().catch((err) => {
  if (err instanceof ScriptExit) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
