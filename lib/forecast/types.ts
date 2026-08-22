import { DurationConfidence } from "./expiry";

/**
 * A contract_awards row once it has a computed forecast — the shape both
 * /forecast (list) and /forecast/[id] (detail) work with. estimatedExpiryDate
 * is non-nullable here (unlike the DB column) because both pages only ever
 * select rows where it's set — an award with duration_confidence "unknown"
 * has no expiry date and is therefore not forecastable, so it's excluded at
 * the query rather than reaching this type with a null.
 */
export interface ForecastAward {
  id: string;
  sourceReference: string;
  contractingAuthority: string;
  cpvCodes: string[];
  awardDate: string | null;
  winnerName: string | null;
  awardValue: number | null;
  awardValueCurrency: string | null;
  sourceUrl: string;
  rawTitle: string | null;
  contractDurationMonths: number | null;
  durationConfidence: DurationConfidence;
  estimatedExpiryDate: string;
}

interface ContractAwardRow {
  id: string;
  source_reference: string;
  contracting_authority: string;
  cpv_codes: string[] | null;
  award_date: string | null;
  winner_name: string | null;
  award_value: number | null;
  award_value_currency: string | null;
  source_url: string;
  raw_title: string | null;
  contract_duration_months: number | null;
  duration_confidence: string;
  estimated_expiry_date: string | null;
}

/** Maps a raw contract_awards row (as returned by supabase-js) into ForecastAward — null-checked in one place instead of at every call site. */
export function mapRowToForecastAward(row: ContractAwardRow): ForecastAward | null {
  if (!row.estimated_expiry_date) return null;
  return {
    id: row.id,
    sourceReference: row.source_reference,
    contractingAuthority: row.contracting_authority,
    cpvCodes: row.cpv_codes ?? [],
    awardDate: row.award_date,
    winnerName: row.winner_name,
    awardValue: row.award_value,
    awardValueCurrency: row.award_value_currency,
    sourceUrl: row.source_url,
    rawTitle: row.raw_title,
    contractDurationMonths: row.contract_duration_months,
    durationConfidence: row.duration_confidence as DurationConfidence,
    estimatedExpiryDate: row.estimated_expiry_date,
  };
}
