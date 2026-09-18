// Turns scripts/generate-outreach-list.ts's CSV into ready-to-send outreach
// messages — merges each row's own data (company name, past win, matched
// open tender, sector) into an email + LinkedIn note/DM + follow-up bump,
// in the company's chosen language (its "language" column: en/fr/nl,
// blank defaults to fr). Doesn't send anything — writes one Markdown
// section per company for you to review and copy-paste yourself.
//
// Not part of the deployed app — run manually via:
//
//   npx tsx scripts/generate-outreach-messages.ts [--in=outreach-list-semicolon.csv] [--delimiter=;] [--out=outreach-messages.md] [--default-language=fr]
//
// Rows whose outreach_status is already something other than blank/"not
// started" are skipped by default (pass --include-contacted to override),
// so re-running after a partial outreach pass only regenerates fresh ones.
//
// Rows with no "language" set are SKIPPED, not guessed, unless you pass
// --default-language explicitly — listed at the end of the output file so
// you can fill them in and rerun.

import { readFileSync, writeFileSync } from "node:fs";
import { ScriptExit } from "./lib/scriptEnv";

// ---------- CLI args ----------

const args = process.argv.slice(2);
function argValue(flag: string, fallback: string): string {
  const found = args.find((a) => a.startsWith(`--${flag}=`));
  return found ? found.slice(flag.length + 3) : fallback;
}
const inPath = argValue("in", "outreach-list-semicolon.csv");
const delimiter = argValue("delimiter", ";");
const outPath = argValue("out", "outreach-messages.md");
// No default unless the user explicitly opts into one: guessing a
// language for a company with no evidence either way is wrong about as
// often as it's right (e.g. CRONOS PUBLIC SERVICES — buyer "Infrabel sa"
// and win title "e-Market 894 - Senior System Administrator MQ" give no
// FR/NL signal at all, so silently defaulting to French produced a
// French message for a Flemish company). Rows with no language and no
// --default-language flag are skipped, not guessed.
const defaultLanguageArg = args.find((a) => a.startsWith("--default-language="));
const defaultLanguage = defaultLanguageArg ? (defaultLanguageArg.slice("--default-language=".length) as Language) : null;
const includeContacted = args.includes("--include-contacted");

type Language = "en" | "fr" | "nl";
const VALID_LANGUAGES: Language[] = ["en", "fr", "nl"];

// ---------- Minimal CSV parser (handles quotes, escaped "", the given delimiter) ----------

function parseCsv(text: string, delim: string): Record<string, string>[] {
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
  return dataRows.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ""])));
}

// ---------- Helpers ----------

function firstName(contactName: string, lang: Language): string {
  const trimmed = contactName.trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  return { en: "[First name]", fr: "[Prénom]", nl: "[Voornaam]" }[lang];
}

// Notice titles from TED/BOSA/regional sources are often long, technical,
// bureaucratic French/Dutch phrasing — truncate before dropping one into a
// sentence, or a single title can run several lines and read as garbled
// rather than personal.
function truncateTitle(title: string, maxLen = 90): string {
  const trimmed = title.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

function formatDeadline(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface RowData {
  companyName: string;
  firstNameText: string;
  mostRecentWinTitle: string;
  mostRecentWinBuyer: string;
  hasOpenTender: boolean;
  openTenderTitle: string;
  openTenderDeadline: string;
  sector: string;
}

interface MessageSet {
  subject: string;
  email: string;
  linkedinNote: string;
  linkedinDm: string;
  bump: string;
}

function buildMessages(lang: Language, d: RowData): MessageSet {
  const tenderClause = d.hasOpenTender;

  if (lang === "fr") {
    const subject = `${d.hasOpenTender ? d.openTenderTitle : "Une opportunité"} — pour ${d.companyName}`;
    const email = `Bonjour ${d.firstNameText},

Félicitations pour votre récent marché avec ${d.mostRecentWinBuyer} (${d.mostRecentWinTitle}) — beau contrat.
${tenderClause
  ? `\nJ'ai remarqué que ${d.openTenderTitle} est actuellement ouvert (échéance : ${d.openTenderDeadline}) et semble correspondre au profil de ${d.companyName} dans le secteur ${d.sector}.`
  : `\nAvec le profil de ${d.companyName} dans le secteur ${d.sector}, je pense qu'il y a d'autres marchés qui pourraient vous intéresser.`}

Je développe TenderProc, un outil qui suit les marchés publics belges — y compris les marchés communaux sous le seuil que TED et BOSA ne couvrent pas — et les met en correspondance automatiquement avec votre entreprise, pour que vous n'ayez plus à les chercher vous-même.

Cela vaut-il le coup d'y jeter un œil ? Gratuit à l'essai : tenderproc.com

Cordialement,
[Votre nom]

P.S. Si les marchés publics ne sont pas une priorité en ce moment, n'hésitez pas à ignorer ce message.`;
    const linkedinNote = `Bonjour ${d.firstNameText}, j'ai vu que ${d.companyName} a récemment remporté un marché avec ${d.mostRecentWinBuyer}. Je développe un outil qui repère automatiquement les marchés publics belges, y compris ceux sous le seuil. Connectons-nous.`;
    const linkedinDm = `Merci pour la connexion ! Petit contexte : j'ai créé TenderProc après avoir constaté que des entreprises comme ${d.companyName} passaient à côté de marchés sous le seuil, invisibles sur TED/BOSA.${
      tenderClause ? ` ${d.openTenderTitle} (échéance ${d.openTenderDeadline}) semblait correspondre à votre profil —` : ""
    } je peux vous montrer comment fonctionne la mise en correspondance, sans engagement.`;
    const bump = `Bonjour ${d.firstNameText}, je me permets de relancer au cas où mon message précédent serait passé inaperçu.${
      tenderClause ? ` ${d.openTenderTitle} se clôture le ${d.openTenderDeadline}, d'où ce rappel pendant qu'il est encore temps.` : ""
    } Je peux vous envoyer d'autres opportunités pour ${d.companyName} si cela vous intéresse.`;
    return { subject, email, linkedinNote, linkedinDm, bump };
  }

  if (lang === "nl") {
    const subject = `${d.hasOpenTender ? d.openTenderTitle : "Een kans"} voor ${d.companyName}`;
    const email = `Beste ${d.firstNameText},

Proficiat met de opdracht bij ${d.mostRecentWinBuyer} (${d.mostRecentWinTitle}) — mooi gerealiseerd.
${tenderClause
  ? `\nIk zag dat ${d.openTenderTitle} momenteel loopt (deadline: ${d.openTenderDeadline}) en dat sluit goed aan bij het trackrecord van ${d.companyName} in de sector ${d.sector}.`
  : `\nGezien het trackrecord van ${d.companyName} in de sector ${d.sector} denk ik dat er ook andere opdrachten interessant kunnen zijn.`}

Ik ontwikkel TenderProc, een tool die Belgische overheidsopdrachten opvolgt — ook de opdrachten onder de drempel die TED en BOSA niet tonen — en die automatisch matcht met uw bedrijfsprofiel, zodat u er niet zelf naar hoeft te zoeken.

Heeft u interesse om er even naar te kijken? Gratis uit te proberen via tenderproc.com.

Met vriendelijke groeten,
[Uw naam]

P.S. Als overheidsopdrachten momenteel geen prioriteit zijn, geen probleem — u mag dit bericht gerust negeren.`;
    const linkedinNote = `Hallo ${d.firstNameText}, ik zag dat ${d.companyName} recent een opdracht binnenhaalde bij ${d.mostRecentWinBuyer}. Ik ontwikkel een tool die Belgische overheidsopdrachten automatisch opspoort, ook onder de drempel. Laten we connecteren.`;
    const linkedinDm = `Bedankt om te connecteren! Even kort geschetst: ik bouwde TenderProc omdat bedrijven zoals ${d.companyName} vaak opdrachten onder de drempel misten — die verschijnen niet op TED of BOSA.${
      tenderClause ? ` ${d.openTenderTitle} (deadline ${d.openTenderDeadline}) leek me een goede match voor u —` : ""
    } ik laat u graag vrijblijvend zien hoe de matching werkt.`;
    const bump = `Beste ${d.firstNameText}, ik stuur dit nog eens door voor het geval mijn vorig bericht ondergesneeuwd is geraakt.${
      tenderClause ? ` ${d.openTenderTitle} sluit af op ${d.openTenderDeadline}, vandaar deze herinnering terwijl er nog tijd is.` : ""
    } Ik stuur u graag meer kansen door voor ${d.companyName} indien nuttig.`;
    return { subject, email, linkedinNote, linkedinDm, bump };
  }

  // en
  const subject = `${d.hasOpenTender ? d.openTenderTitle : "An opportunity"} — thought of ${d.companyName}`;
  const email = `Hi ${d.firstNameText},

Congrats on your recent contract with ${d.mostRecentWinBuyer} (${d.mostRecentWinTitle}) — nice win.
${tenderClause
  ? `\nI noticed ${d.openTenderTitle} is open right now (deadline ${d.openTenderDeadline}) and looks like a strong fit given ${d.companyName}'s track record in ${d.sector}.`
  : `\nGiven ${d.companyName}'s track record in ${d.sector}, I think there may be other tenders worth your attention.`}

I'm building TenderProc — it tracks Belgian public tenders, including the sub-threshold municipal ones TED and BOSA don't cover, and matches them to your company automatically so you're not hunting for them manually.

Worth a quick look? Free to try: tenderproc.com

Best,
[Your name]

P.S. If procurement isn't your focus right now, feel free to ignore this.`;
  const linkedinNote = `Hi ${d.firstNameText} — saw ${d.companyName} won ${d.mostRecentWinBuyer}'s tender recently. Building a tool that surfaces Belgian public tenders automatically, incl. sub-threshold ones most tools miss. Would love to connect.`;
  const linkedinDm = `Thanks for connecting! Quick context: I built TenderProc after noticing companies like ${d.companyName} were missing sub-threshold municipal tenders that never hit TED/BOSA.${
    tenderClause ? ` ${d.openTenderTitle} (closes ${d.openTenderDeadline}) looked like a fit for you —` : ""
  } happy to show you how the matching works if useful, no pressure either way.`;
  const bump = `Hi ${d.firstNameText}, just following up in case this got buried.${
    tenderClause ? ` ${d.openTenderTitle} closes ${d.openTenderDeadline}, so flagging it while there's still time.` : ""
  } Happy to send more matches for ${d.companyName} if it's useful.`;
  return { subject, email, linkedinNote, linkedinDm, bump };
}

// ---------- Main ----------

function main() {
  let text: string;
  try {
    text = readFileSync(inPath, "utf8");
  } catch {
    throw new ScriptExit(`Could not read ${inPath}. Run scripts/generate-outreach-list.ts first, or pass --in=<path>.`);
  }

  const rows = parseCsv(text, delimiter);
  if (!rows.length) throw new ScriptExit(`${inPath} parsed to zero rows — check --delimiter matches the file.`);
  if (!("company_name" in rows[0])) {
    throw new ScriptExit(
      `${inPath} doesn't look like an outreach-list CSV (no "company_name" column). Check --delimiter (try --delimiter=,).`
    );
  }

  const sections: string[] = [];
  const needsLanguage: string[] = [];
  let skippedContacted = 0;
  let count = 0;

  for (const row of rows) {
    const status = (row.outreach_status ?? "").trim().toLowerCase();
    if (!includeContacted && status && status !== "not started") {
      skippedContacted++;
      continue;
    }

    const langRaw = (row.language ?? "").trim().toLowerCase() as Language;
    let lang: Language;
    if (VALID_LANGUAGES.includes(langRaw)) {
      lang = langRaw;
    } else if (defaultLanguage) {
      lang = defaultLanguage;
    } else {
      needsLanguage.push(row.company_name);
      continue;
    }

    const data: RowData = {
      companyName: row.company_name,
      firstNameText: firstName(row.contact_name ?? "", lang),
      mostRecentWinTitle: truncateTitle(row.most_recent_win_title || "a recent public contract"),
      mostRecentWinBuyer: row.most_recent_win_buyer || "a public buyer",
      hasOpenTender: Boolean(row.open_tender_1_title),
      openTenderTitle: truncateTitle(row.open_tender_1_title),
      openTenderDeadline: formatDeadline(row.open_tender_1_deadline),
      sector: row.sector,
    };

    const msg = buildMessages(lang, data);
    count++;

    sections.push(
      [
        `## ${data.companyName} (${lang.toUpperCase()}${row.match_confidence === "possible" ? ", KBO match unverified" : ""})`,
        "",
        `- Enterprise number: ${row.enterprise_number || "—"}`,
        `- LinkedIn search: ${row.linkedin_search_url || "—"}`,
        `- Contact on file: ${row.contact_name || "(none yet — find one before sending)"}`,
        "",
        `**Email subject:** ${msg.subject}`,
        "",
        "**Email body:**",
        "```",
        msg.email,
        "```",
        "",
        "**LinkedIn connection note:**",
        "```",
        msg.linkedinNote,
        "```",
        "",
        "**LinkedIn follow-up DM (after they accept):**",
        "```",
        msg.linkedinDm,
        "```",
        "",
        "**Follow-up bump (send once, after 2-3 days of silence):**",
        "```",
        msg.bump,
        "```",
        "",
        "---",
      ].join("\n")
    );
  }

  const needsLanguageBlock = needsLanguage.length
    ? `\n## Needs a language before a message can be generated (${needsLanguage.length})\n\nFill in the "language" column (en/fr/nl) for these in ${inPath} and rerun — skipped rather than guessed, since there's no reliable signal to guess from:\n\n${needsLanguage
        .map((n) => `- ${n}`)
        .join("\n")}\n\n---\n`
    : "";

  const header = `# TenderProc outreach messages\n\nGenerated from ${inPath}. ${count} companies below${
    skippedContacted ? `, ${skippedContacted} already-contacted rows skipped (pass --include-contacted to regenerate them too)` : ""
  }${needsLanguage.length ? `, ${needsLanguage.length} skipped for missing language (listed at the end)` : ""}. Nothing here has been sent — review and copy-paste per company.\n\n---\n`;

  writeFileSync(outPath, header + sections.join("\n") + "\n" + needsLanguageBlock, "utf8");
  console.log(`Wrote ${count} companies' messages to ${outPath}.`);
  if (skippedContacted) console.log(`Skipped ${skippedContacted} rows already marked as contacted.`);
  if (needsLanguage.length) console.log(`Skipped ${needsLanguage.length} rows with no resolvable language (listed at the end of the file) — fill in "language" and rerun.`);
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
