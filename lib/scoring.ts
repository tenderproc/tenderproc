import { createHash } from "crypto";
import { getAnthropicClient } from "./ai/anthropic-provider";
import { TenderNotice } from "./types";
import { LOCALE_ENGLISH_NAME, type Locale } from "./locales";

export interface CompanyProfile {
  sectors: string[];
  languages: string[];
  description: string;
  address: string;
  companySize: string;
}

export interface MatchCriterion {
  label: string;
  met: boolean;
}

export interface MatchScore {
  publicationNumber: string;
  score: number;
  summary: string;
  criteria: MatchCriterion[];
}

export function hasProfileSignal(profile: CompanyProfile): boolean {
  return Boolean(
    profile.description.trim() || profile.address.trim() || profile.sectors.length > 0
  );
}

// Changes to any of these should invalidate cached scores. `locale` is
// included so switching the UI language re-scores into that language rather
// than serving a cached English (or other-locale) summary/criteria — see
// scoreTenders' language instruction below. tender_scores has no separate
// locale column (upsert is keyed on user_id+publication_number only), so this
// means only the most-recently-viewed locale's score stays cached per tender;
// acceptable for a beta rather than a migration to add multi-locale caching.
export function profileHash(profile: CompanyProfile, locale: Locale): string {
  const stable = JSON.stringify({
    sectors: [...profile.sectors].sort(),
    description: profile.description.trim(),
    address: profile.address.trim(),
    companySize: profile.companySize.trim(),
    locale,
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

export const MATCH_BAND_MIN_SCORE = {
  strong: 85,
  good: 65,
  possible: 40,
  weak: 0,
} as const;

function matchBand(score: number): "strong" | "good" | "possible" | "weak" {
  if (score >= MATCH_BAND_MIN_SCORE.strong) return "strong";
  if (score >= MATCH_BAND_MIN_SCORE.good) return "good";
  if (score >= MATCH_BAND_MIN_SCORE.possible) return "possible";
  return "weak";
}

const ENGLISH_MATCH_LABEL: Record<ReturnType<typeof matchBand>, string> = {
  strong: "Strong match",
  good: "Good match",
  possible: "Possible match",
  weak: "Weak match",
};

export function matchLabel(score: number, t?: (key: string) => string): string {
  const band = matchBand(score);
  if (t) {
    try {
      return t(band);
    } catch {
      // fall through to the English default below
    }
  }
  return ENGLISH_MATCH_LABEL[band];
}

const SYSTEM_PROMPT = `You help a Belgian SME quickly triage a list of public tender notices
against their own business. For EACH tender given, produce a match score.

You only have notice METADATA (title, buyer, CPV codes, value, deadline, notice
type) — not the full tender document. Never invent specific legal, technical,
or financial requirements that aren't visible in the metadata; a deeper,
document-based check happens separately once someone opens a tender.

Ground every score in what's actually knowable from metadata:
- Sector/service fit: does the CPV/title match the company's description?
- Geographic fit: does the buyer's location/name plausibly fall in or near the
  company's stated address (if given)?
- Scale fit: is the estimated value plausible given the company's size band
  (if given) — not a red flag either way if value or size is unknown.
- Procedure accessibility: is this a genuinely open, biddable notice type?

Respond ONLY with a JSON array, no other text, one entry per tender in the
same order given:
[
  {
    "publicationNumber": "...",
    "score": 0-100,
    "summary": "One sentence, written directly to the business owner, e.g. \\"You're a commercial cleaning company operating in Antwerp — this tender matches your sector and is based near you.\\"",
    "criteria": [
      { "label": "short criterion, e.g. 'Sector matches CPV code'", "met": true },
      ...3-5 total, only criteria you can actually assess from the metadata given
    ]
  }
]

Score conservatively when the company description is vague or missing — don't
fabricate confidence.`;

export async function scoreTenders(
  tenders: TenderNotice[],
  profile: CompanyProfile,
  locale: Locale
): Promise<MatchScore[]> {
  if (tenders.length === 0) return [];
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const client = getAnthropicClient();
  // The prompt's own JSON example is in English; without this the model
  // defaults to English for free-text fields regardless of UI locale.
  const system =
    locale === "en"
      ? SYSTEM_PROMPT
      : `${SYSTEM_PROMPT}\n\nWrite the "summary" text and every criterion "label" in ${LOCALE_ENGLISH_NAME[locale]}, even though the example above is in English. Field names and the true/false "met" values stay as specified.`;

  const profileText = `Company profile:
Sectors: ${profile.sectors.join(", ") || "not specified"}
Address: ${profile.address || "not specified"}
Company size: ${profile.companySize || "not specified"}
Description: ${profile.description || "not specified"}`;

  const tendersText = tenders
    .map(
      (t, i) => `${i + 1}. publicationNumber: ${t.publicationNumber}
Title: ${t.title}
Buyer: ${t.buyerName} (${t.buyerCountry})
CPV codes: ${t.cpvCodes.join(", ") || "unknown"}
Estimated value: ${t.totalValue ?? "unknown"}
Deadline: ${t.deadline ?? "unknown"}`
    )
    .join("\n\n");

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system,
      messages: [
        { role: "user", content: `${profileText}\n\nTenders:\n\n${tendersText}` },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((p) => typeof p?.publicationNumber === "string" && typeof p?.score === "number")
      .map((p) => ({
        publicationNumber: p.publicationNumber,
        score: Math.max(0, Math.min(100, Math.round(p.score))),
        summary: typeof p.summary === "string" ? p.summary : "",
        criteria: Array.isArray(p.criteria)
          ? p.criteria
              .filter((c: unknown) => typeof (c as { label?: unknown })?.label === "string")
              .map((c: { label: string; met: boolean }) => ({
                label: c.label,
                met: Boolean(c.met),
              }))
          : [],
      }));
  } catch (err) {
    console.error("scoreTenders failed", err);
    return [];
  }
}
