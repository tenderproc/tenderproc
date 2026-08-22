export interface MarketShareAward {
  winnerName: string | null;
  awardValue: number | null;
  cpvCodes: string[];
}

interface ContractAwardRow {
  winner_name: string | null;
  award_value: number | null;
  cpv_codes: string[] | null;
}

/** Maps a raw contract_awards row (as returned by supabase-js) into MarketShareAward — same one-place-null-check shape as lib/forecast/types.ts's mapRowToForecastAward. */
export function mapRowToMarketShareAward(row: ContractAwardRow): MarketShareAward {
  return {
    winnerName: row.winner_name,
    awardValue: row.award_value,
    cpvCodes: row.cpv_codes ?? [],
  };
}
