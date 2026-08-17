export interface TenderNotice {
  publicationNumber: string;
  title: string;
  buyerName: string;
  buyerCountry: string;
  totalValue: string | null;
  /** Raw numeric value backing `totalValue`, for range filtering — null if no value field was present or parseable. */
  totalValueRaw: number | null;
  deadline: string | null;
  publicationDate: string | null;
  cpvCodes: string[];
  /** Language(s) (lib/languages.ts keys) TED's official-language field says this notice was actually published in — the ground truth for why the title reads in a given language, since TED never translates the buyer's own title text. Empty if the source didn't publish this field. */
  titleLanguages: string[];
  url: string;
}

/**
 * Richer, source-agnostic shape for the tender detail page's in-app
 * overview. Extends `TenderNotice` (used by search/list) with fields that
 * are only fetched for a single notice (heavier i18n text, documents) —
 * every source that eventually feeds `/tenders/[id]` should map into this
 * same shape rather than the page growing source-specific branches.
 * Fields are `null`/empty when the source genuinely doesn't publish them —
 * the UI shows an explicit "not published" state rather than hiding the row.
 */
export interface TenderDetail extends TenderNotice {
  /** Human name of the source for attribution, e.g. "TED", "BOSA e-Notification". */
  sourceName: string;
  /** Object of the contract / procedure description, in the resolved display language. */
  description: string | null;
  /** Raw procedure-type code from the source (e.g. eForms "open", "restricted"). */
  procedureType: string | null;
  /** Human-readable region, e.g. "Prov. Limburg (Belgium)" — derived from country/NUTS data. */
  region: string | null;
  /** Links to the notice's documents/specifications, separate from the main source link. */
  documentUrls: string[];
}

export interface AwardedTender {
  publicationNumber: string;
  title: string;
  buyerName: string;
  winnerName: string;
  winnerCountry: string;
  value: string | null;
  valueRaw: number | null;
  publicationDate: string | null;
  cpvCodes: string[];
  url: string;
}

export interface EligibilityResult {
  verdict: "ELIGIBLE" | "REVIEW NEEDED" | "NOT ELIGIBLE";
  summary: string;
  keyRequirements: string[];
  deadlineFlag: string | null;
  disclaimer: string;
}
