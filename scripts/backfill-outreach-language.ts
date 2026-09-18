// Fills in blank "language" cells on an already-generated outreach-list
// CSV using scripts/lib/guessLanguage.ts's NL/FR heuristic, without
// touching anything else — safe to run on a file you've already started
// filling in contact_name/contact_email/outreach_status manually. Only
// exists to patch files generated before generate-outreach-list.ts itself
// started guessing the language column; a fresh run of that script no
// longer needs this.
//
//   npx tsx scripts/backfill-outreach-language.ts [--in=outreach-list-semicolon.csv] [--delimiter=;] [--out=<same as --in>]
//
// If --out matches an already-open file (e.g. open in Excel), the write
// fails with EBUSY — close it first, or pass a different --out.

import { readFileSync, writeFileSync } from "node:fs";
import { ScriptExit } from "./lib/scriptEnv";
import { guessLanguage } from "./lib/guessLanguage";

const args = process.argv.slice(2);
function argValue(flag: string, fallback: string): string {
  const found = args.find((a) => a.startsWith(`--${flag}=`));
  return found ? found.slice(flag.length + 3) : fallback;
}
const inPath = argValue("in", "outreach-list-semicolon.csv");
const delimiter = argValue("delimiter", ";");
const outPath = argValue("out", inPath);

// Same minimal parser as generate-outreach-messages.ts — kept local since
// this is a one-off migration script, not shared infrastructure.
function parseCsv(text: string, delim: string): { header: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
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
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...dataRows] = rows;
  return { header, rows: dataRows };
}

function csvField(value: string, delim: string): string {
  if (new RegExp(`[${delim}",\n]`).test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function main() {
  let text: string;
  try {
    text = readFileSync(inPath, "utf8");
  } catch {
    throw new ScriptExit(`Could not read ${inPath}.`);
  }

  const { header, rows } = parseCsv(text, delimiter);
  let langIdx = header.indexOf("language");
  if (langIdx === -1) {
    // Older file predates the language column entirely (added to
    // generate-outreach-list.ts after this CSV was generated) — insert it
    // in the same position a fresh run would put it: right after
    // linkedin_search_url, before contact_name.
    const insertAfter = header.indexOf("linkedin_search_url");
    langIdx = insertAfter === -1 ? header.length : insertAfter + 1;
    header.splice(langIdx, 0, "language");
    for (const row of rows) row.splice(langIdx, 0, "");
    console.log(`No "language" column found — inserting one at position ${langIdx}.`);
  }
  const companyIdx = header.indexOf("company_name");
  const buyerIdx = header.indexOf("most_recent_win_buyer");
  const winTitleIdx = header.indexOf("most_recent_win_title");
  const tenderTitleIdxs = [
    header.indexOf("open_tender_1_title"),
    header.indexOf("open_tender_2_title"),
    header.indexOf("open_tender_3_title"),
  ].filter((i) => i !== -1);

  let filled = 0;
  let leftBlank = 0;
  let alreadySet = 0;

  for (const row of rows) {
    if (row[langIdx]?.trim()) {
      alreadySet++;
      continue;
    }
    const text = [
      companyIdx !== -1 ? row[companyIdx] : "",
      buyerIdx !== -1 ? row[buyerIdx] : "",
      winTitleIdx !== -1 ? row[winTitleIdx] : "",
      ...tenderTitleIdxs.map((i) => row[i] ?? ""),
    ].join(" ");
    const guess = guessLanguage(text);
    if (guess) {
      row[langIdx] = guess;
      filled++;
    } else {
      leftBlank++;
    }
  }

  const outLines = [
    header.map((h) => csvField(h, delimiter)).join(delimiter),
    ...rows.map((r) => r.map((f) => csvField(f, delimiter)).join(delimiter)),
  ];

  try {
    writeFileSync(outPath, outLines.join("\n"), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EBUSY") {
      throw new ScriptExit(`${outPath} is open in another program (e.g. Excel) — close it first, or pass --out=<other file>.`);
    }
    throw err;
  }

  console.log(`Backfilled ${filled} rows, left ${leftBlank} ambiguous (blank, review manually), ${alreadySet} already had a language set. Wrote ${outPath}.`);
}

try {
  main();
} catch (err) {
  if (err instanceof ScriptExit) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
}
