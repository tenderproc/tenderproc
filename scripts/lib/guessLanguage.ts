// Best-effort NL/FR guess from Belgian institution/geography vocabulary —
// used to pre-fill the outreach CSV's "language" column instead of
// defaulting every company to the same language regardless of region.
// Deliberately conservative: only distinctive words are scored (not
// short/common ones like "de"/"van"/"le"/"la", which are too noisy on
// short buyer-name strings and appear across languages), and a tie or
// weak signal returns "" so a human still reviews the ambiguous ones
// rather than getting a confident-looking wrong guess.

export type GuessedLanguage = "fr" | "nl" | "";

const NL_MARKERS = [
  "vlaamse", "vlaanderen", "gemeente", "stad", "provincie", "overheid",
  "agentschap", "aanbesteding", "opdracht", "onderhoud", "wegen", "bouwen",
  "straat", "plein", "steenweg", "universiteit", "hogeschool",
  "infrastructuur", "renovatie", "vernieuwing", "ringlaan", "kruispunt",
  "fietstunnel", "riolering", "ziekenhuis", "ministerie", "intercommunale",
  "waterwegen", "dienst",
];

const FR_MARKERS = [
  "wallonie", "wallon", "wallonne", "commune", "ville", "province",
  "région", "marché", "rue", "avenue", "place", "société", "rénovation",
  "construction", "travaux", "hôpital", "ministère", "université",
  "chaussée", "égout", "égouttage", "service public", "intercommunale",
  "voirie", "entretien",
];

function score(text: string, markers: string[]): number {
  const lower = text.toLowerCase();
  return markers.reduce((total, marker) => {
    const re = new RegExp(`\\b${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    return total + (lower.match(re)?.length ?? 0);
  }, 0);
}

/** Requires a clear margin (not just >0) before committing to a guess. */
export function guessLanguage(text: string): GuessedLanguage {
  const nlScore = score(text, NL_MARKERS);
  const frScore = score(text, FR_MARKERS);
  if (nlScore === 0 && frScore === 0) return "";
  if (nlScore >= frScore + 2) return "nl";
  if (frScore >= nlScore + 2) return "fr";
  return "";
}
