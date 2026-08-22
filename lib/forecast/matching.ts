import { sectorsToCpvPrefixes } from "@/lib/sectors";

export interface ForecastableAward {
  cpvCodes: string[];
}

/**
 * Same CPV-prefix matching the Opportunities feed and the award-ingestion
 * cron already use (lib/sectors.ts's sectorsToCpvPrefixes) — deliberately
 * not the separate AI match-score system (lib/scoring.ts), since that scores
 * individually-fetched live TED notices per user session and would mean a
 * fresh Anthropic call per viewer for a shared, slowly-changing table.
 * A CPV-prefix filter over already-ingested contract_awards rows is cheap,
 * deterministic, and consistent with how ingest-awards itself decides which
 * sectors' awards are worth storing in the first place.
 */
export function filterAwardsBySector<T extends ForecastableAward>(
  awards: T[],
  selectedSectorKeys: string[]
): T[] {
  const prefixes = sectorsToCpvPrefixes(selectedSectorKeys);
  if (prefixes.length === 0) return awards;
  return awards.filter((a) => a.cpvCodes.some((code) => prefixes.some((p) => code.startsWith(p))));
}
