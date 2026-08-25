// Shared CSV-streaming import logic for kbo_companies, used by both
// scripts/import-kbo-companies.ts (manual, one-off) and
// scripts/refresh-kbo-companies.ts (automated monthly refresh). See either
// caller's header comment for the bigger picture.

import { existsSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ScriptExit } from "./scriptEnv";

// Quote-aware CSV line splitter (RFC4180-ish: double-quote wrapped fields,
// "" as an escaped quote). KBO Open Data denominations don't contain literal
// newlines, so line-by-line streaming (no multi-line quoted fields) is safe.
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

async function readCsv(filePath: string, onRow: (row: Record<string, string>) => Promise<void> | void) {
  if (!existsSync(filePath)) {
    throw new ScriptExit(`Expected file not found: ${filePath}`);
  }
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const line of rl) {
    if (!line) continue;
    const cols = parseCsvLine(line);
    if (!header) {
      header = cols;
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((key, i) => (row[key] = cols[i] ?? ""));
    await onRow(row);
  }
}

// KBO dates are DD-MM-YYYY; Postgres wants YYYY-MM-DD.
function toIsoDate(kboDate: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(kboDate.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

export type KboImportStats = { activeEnterprises: number; scanned: number; imported: number };

// Only currently active ("AC") enterprises are imported, matched against
// every denomination row on file for them (legal name, abbreviation,
// commercial name, any language) so the search can match on whichever name
// variant the user actually types. Table is append-only from this
// function's perspective — pass truncateFirst for a refresh (a new KBO
// export replaces prior data, it doesn't merge with it).
export async function importKboFromFolder(
  folder: string,
  supabase: SupabaseClient,
  { truncateFirst = false }: { truncateFirst?: boolean } = {}
): Promise<KboImportStats> {
  if (truncateFirst) {
    console.log("Truncating kbo_companies before reimport...");
    const { error } = await supabase.rpc("truncate_kbo_companies");
    if (error) throw new Error(`Truncate failed: ${error.message}`);
  }

  console.log("Pass 1/2: reading enterprise.csv for active enterprises...");
  const activeStartDates = new Map<string, string | null>();
  await readCsv(path.join(folder, "enterprise.csv"), (row) => {
    if (row.Status !== "AC") return;
    activeStartDates.set(row.EnterpriseNumber, toIsoDate(row.StartDate ?? ""));
  });
  console.log(`Found ${activeStartDates.size} active enterprises.`);

  console.log("Pass 2/2: reading denomination.csv and importing...");
  const BATCH_SIZE = 1000;
  let batch: { enterprise_number: string; denomination: string; start_date: string | null }[] = [];
  let imported = 0;
  let scanned = 0;

  async function flush() {
    if (batch.length === 0) return;
    const { error } = await supabase.from("kbo_companies").insert(batch);
    if (error) throw new Error(`Insert failed after ${imported} rows: ${error.message}`);
    imported += batch.length;
    batch = [];
    console.log(`  imported ${imported} rows (scanned ${scanned} denomination rows so far)...`);
  }

  await readCsv(path.join(folder, "denomination.csv"), async (row) => {
    scanned++;
    const denomination = (row.Denomination ?? "").trim();
    const entityNumber = row.EntityNumber;
    if (!denomination || !activeStartDates.has(entityNumber)) return;
    batch.push({
      enterprise_number: entityNumber,
      denomination,
      start_date: activeStartDates.get(entityNumber) ?? null,
    });
    if (batch.length >= BATCH_SIZE) await flush();
  });
  await flush();

  console.log(`Done. Scanned ${scanned} denomination rows, imported ${imported}.`);
  return { activeEnterprises: activeStartDates.size, scanned, imported };
}
