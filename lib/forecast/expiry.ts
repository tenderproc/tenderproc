import { lookupFallbackDurationMonths } from "./durationDefaults";

export type DurationConfidence = "confirmed" | "estimated" | "unknown";

export interface EstimatedExpiry {
  /** Total contract duration in months backing `expiryDate`, whatever its source. Null only when confidence is "unknown". */
  months: number | null;
  confidence: DurationConfidence;
  /** YYYY-MM-DD. Null whenever a duration/end-date couldn't be determined, OR one was determined but there's no award_date to anchor it to — confidence can still be "confirmed"/"estimated" in that second case; see the params doc below. */
  expiryDate: string | null;
}

export interface ComputeEstimatedExpiryParams {
  /** YYYY-MM-DD, e.g. contract_awards.award_date. May be null — TED doesn't always publish a usable date. */
  awardDate: string | null;
  /** From lib/ted.ts's parseAwardDuration — an explicit total-duration figure TED published for this notice. */
  explicitDurationMonths: number | null;
  /** From lib/ted.ts's parseAwardDuration — TED's own stated contract end date. When present this is used directly instead of awardDate + duration arithmetic, since it's the more direct signal (and needs no award_date at all). */
  explicitExpiryDate: string | null;
  cpvCodes: string[];
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Single source of truth for turning an award's duration data into
 * estimated_expiry_date + duration_confidence. Tries, in order: (1) a
 * literal end date TED published, (2) an explicit duration figure TED
 * published (from lib/ted.ts's parseAwardDuration — includes any AI-assisted
 * free-text extraction already folded in upstream), (3) the CPV-prefix
 * fallback table (lib/forecast/durationDefaults.ts). Never guesses when none
 * of these produce a number — per spec, "unknown" stays null rather than
 * silently estimating.
 */
export function computeEstimatedExpiry(params: ComputeEstimatedExpiryParams): EstimatedExpiry {
  if (params.explicitExpiryDate) {
    return { months: null, confidence: "confirmed", expiryDate: params.explicitExpiryDate };
  }

  if (params.explicitDurationMonths != null) {
    return {
      months: params.explicitDurationMonths,
      confidence: "confirmed",
      expiryDate: params.awardDate ? addMonths(params.awardDate, params.explicitDurationMonths) : null,
    };
  }

  const fallbackMonths = lookupFallbackDurationMonths(params.cpvCodes);
  if (fallbackMonths != null) {
    return {
      months: fallbackMonths,
      confidence: "estimated",
      expiryDate: params.awardDate ? addMonths(params.awardDate, fallbackMonths) : null,
    };
  }

  return { months: null, confidence: "unknown", expiryDate: null };
}
