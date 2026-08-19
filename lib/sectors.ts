export interface Sector {
  key: string;
  label: string;
  cpvPrefixes: string[];
}

// Friendly sector picks mapped to CPV division prefixes, so the DB/UI never
// has to deal with raw CPV codes directly.
export const SECTORS: Sector[] = [
  // Labels below spell out example trades explicitly where a division is
  // broader than its old short name implied (confirmed via UX testing —
  // e.g. security guards, graphic designers and translators all file
  // under CPV 79 "Consulting" without that ever being obvious from the
  // label). Existing cpvPrefixes are unchanged; this is copy-only.
  { key: "construction", label: "Construction, works & electrical", cpvPrefixes: ["45"] },
  { key: "it-telecom", label: "IT, software & telecom", cpvPrefixes: ["48", "72", "32", "64"] },
  { key: "consulting", label: "Consulting, security, design & translation", cpvPrefixes: ["79"] },
  { key: "engineering", label: "Engineering & architecture", cpvPrefixes: ["71"] },
  { key: "cleaning-facilities", label: "Cleaning, waste & facility services", cpvPrefixes: ["90", "50"] },
  { key: "transport-logistics", label: "Transport & logistics", cpvPrefixes: ["60", "63"] },
  { key: "catering", label: "Catering & food services", cpvPrefixes: ["55", "15"] },
  { key: "healthcare", label: "Healthcare, childcare & social services", cpvPrefixes: ["85"] },
  { key: "education", label: "Education & training", cpvPrefixes: ["80"] },
  { key: "supplies-equipment", label: "Office supplies & equipment", cpvPrefixes: ["30", "39"] },
  // New sectors — CPV divisions with no prior coverage under any existing
  // prefix above (confirmed via UX testing across two feedback rounds).
  { key: "landscaping", label: "Landscaping & green spaces", cpvPrefixes: ["77"] },
  { key: "energy-sustainability", label: "Energy & sustainability", cpvPrefixes: ["09"] },
  { key: "printing-signage", label: "Printing & signage", cpvPrefixes: ["22"] },
  // Deliberately empty cpvPrefixes: this is the escape hatch for a
  // business that doesn't fit any sector above (see the free-text
  // "what does your business do?" field, required when this is picked —
  // app/signup/page.tsx). sectorsToCpvPrefixes() contributes nothing for
  // it, so selecting it alone shows every open Belgian tender unfiltered,
  // relying on the AI match score (which reads that description) for
  // relevance instead of a CPV filter that has nothing to match against.
  { key: "other", label: "Other — show me everything", cpvPrefixes: [] },
];

export function sectorsToCpvPrefixes(keys: string[]): string[] {
  const prefixes = SECTORS.filter((s) => keys.includes(s.key)).flatMap((s) => s.cpvPrefixes);
  return Array.from(new Set(prefixes));
}

/** Reverse lookup: given a tender's CPV codes, find the first matching sector's label, for display. */
export function sectorLabelForCpv(cpvCodes: string[], t?: (key: string) => string): string | null {
  const sector = SECTORS.find((s) =>
    s.cpvPrefixes.some((prefix) => cpvCodes.some((code) => code.startsWith(prefix)))
  );
  if (!sector) return null;
  if (t) {
    try {
      return t(sector.key);
    } catch {
      // fall through to the English default below
    }
  }
  return sector.label;
}

export function sectorLabels(keys: string[], t?: (key: string) => string): string[] {
  return SECTORS.filter((s) => keys.includes(s.key)).map((s) => {
    if (t) {
      try {
        return t(s.key);
      } catch {
        // fall through to the English default below
      }
    }
    return s.label;
  });
}
