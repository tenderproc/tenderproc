// Belgian legal-form suffixes (plus a few common foreign ones that show up
// as TED winner names for cross-border bidders), tokenized after dots have
// already been stripped — "S.A." and "N.V." both survive as "sa"/"nv".
const LEGAL_SUFFIXES = new Set([
  "sa",
  "nv",
  "srl",
  "bv",
  "bvba",
  "sprl",
  "cvba",
  "cv",
  "scrl",
  "vzw",
  "asbl",
  "scs",
  "gcv",
  "gie",
  "commv",
  "ltd",
  "llc",
  "gmbh",
  "plc",
  "inc",
  "co",
]);

/**
 * Normalizes a company name for exact-match grouping: lowercase, legal-form
 * suffixes (SA/SRL/NV/BV/...) stripped, punctuation/whitespace collapsed.
 * This is deliberately just normalization, not fuzzy/typo-tolerant matching
 * (e.g. "Acme Trucks" vs "Acme Truck's" vs a misspelling would still group
 * separately) — a later improvement if normalized exact-match proves
 * insufficient in practice.
 */
export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return "";

  let s = raw.toLowerCase();
  s = s.replace(/\./g, ""); // collapse abbreviation dots first: "s.a." -> "sa", "n.v." -> "nv"
  s = s.replace(/[^a-z0-9\s-]/g, " "); // drop remaining punctuation (commas, apostrophes, ampersands, parens)
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";

  const tokens = s.split(" ");
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}
