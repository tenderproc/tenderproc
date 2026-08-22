/**
 * Fallback typical contract lengths by CPV division prefix — used only when
 * a TED award notice states no explicit duration (see
 * lib/ted.ts's parseAwardDuration and lib/forecast/expiry.ts's
 * computeEstimatedExpiry, which tries explicit TED data first). A match here
 * always sets duration_confidence = "estimated", never "confirmed".
 *
 * These are rough, editable estimates of common Belgian public-contract
 * practice per sector — not sourced from any single authority. Add rows,
 * adjust typicalMonths, or narrow/widen a cpvPrefix as real ingested
 * durations (lib/ted.ts's parseAwardDuration output, ~70% fill rate on a
 * live Belgian CAN sample checked 2026-08-22) show a sector's actual typical
 * length. First matching prefix wins — order narrower/more specific
 * prefixes before broader ones if that ever becomes necessary; today every
 * prefix here is a distinct 2-digit CPV division, so match order doesn't matter.
 */
export interface DurationFallbackRow {
  cpvPrefix: string;
  sectorLabel: string;
  typicalMonths: number;
}

export const DURATION_FALLBACK_BY_CPV_PREFIX: DurationFallbackRow[] = [
  { cpvPrefix: "90", sectorLabel: "Cleaning, waste & facility services", typicalMonths: 42 },
  { cpvPrefix: "50", sectorLabel: "Maintenance & repair services", typicalMonths: 42 },
  { cpvPrefix: "79", sectorLabel: "Consulting, security, design & translation", typicalMonths: 36 },
  { cpvPrefix: "71", sectorLabel: "Engineering & architecture", typicalMonths: 24 },
  { cpvPrefix: "45", sectorLabel: "Construction, works & electrical", typicalMonths: 18 },
  { cpvPrefix: "60", sectorLabel: "Transport services", typicalMonths: 48 },
  { cpvPrefix: "63", sectorLabel: "Logistics & freight support", typicalMonths: 48 },
  { cpvPrefix: "55", sectorLabel: "Catering & food services", typicalMonths: 36 },
  { cpvPrefix: "15", sectorLabel: "Food supply", typicalMonths: 24 },
  { cpvPrefix: "85", sectorLabel: "Healthcare, childcare & social services", typicalMonths: 48 },
  { cpvPrefix: "80", sectorLabel: "Education & training", typicalMonths: 36 },
  { cpvPrefix: "48", sectorLabel: "Software packages", typicalMonths: 36 },
  { cpvPrefix: "72", sectorLabel: "IT services", typicalMonths: 36 },
  { cpvPrefix: "32", sectorLabel: "Telecom equipment", typicalMonths: 48 },
  { cpvPrefix: "64", sectorLabel: "Telecom services", typicalMonths: 48 },
  { cpvPrefix: "77", sectorLabel: "Landscaping & green spaces", typicalMonths: 36 },
  { cpvPrefix: "09", sectorLabel: "Energy supply", typicalMonths: 24 },
  { cpvPrefix: "22", sectorLabel: "Printing & signage", typicalMonths: 24 },
  { cpvPrefix: "30", sectorLabel: "Office supplies & equipment", typicalMonths: 24 },
  { cpvPrefix: "39", sectorLabel: "Furniture & fittings", typicalMonths: 24 },
];

export function lookupFallbackDurationMonths(cpvCodes: string[]): number | null {
  for (const code of cpvCodes) {
    const match = DURATION_FALLBACK_BY_CPV_PREFIX.find((row) => code.startsWith(row.cpvPrefix));
    if (match) return match.typicalMonths;
  }
  return null;
}
