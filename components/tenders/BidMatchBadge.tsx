import { getTranslations } from "next-intl/server";

type MatchBand = "strong" | "good" | "moderate" | "weak";

const BAND_STYLE: Record<MatchBand, string> = {
  strong: "bg-moss/10 border-moss/25 text-moss",
  good: "bg-accent/10 border-accent/25 text-accent",
  moderate: "bg-gold/10 border-gold/25 text-gold",
  weak: "bg-stamp/10 border-stamp/25 text-stamp",
};

/** Derived from the score, not the AI-generated matchLabel text — a label is
 * free text and must never be trusted as a stable key (it's also what makes
 * this stylable/translatable independent of the language it was generated in). */
function bandForScore(score: number): MatchBand {
  if (score >= 85) return "strong";
  if (score >= 65) return "good";
  if (score >= 40) return "moderate";
  return "weak";
}

type RecommendationCode = "BID" | "CONSIDER" | "NO-BID";

const RECOMMENDATION_STYLE: Record<RecommendationCode, string> = {
  BID: "bg-moss/10 border-moss/25 text-moss",
  CONSIDER: "bg-gold/10 border-gold/25 text-gold",
  "NO-BID": "bg-stamp/10 border-stamp/25 text-stamp",
};

const RECOMMENDATION_KEY: Record<RecommendationCode, string> = {
  BID: "bid",
  CONSIDER: "consider",
  "NO-BID": "noBid",
};

export async function MatchScorePill({ score }: { score: number }) {
  const t = await getTranslations("Enums.matchLabel");
  const band = bandForScore(score);
  return (
    <div className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 ${BAND_STYLE[band]}`}>
      <span className="text-sm font-semibold">
        {score}/100 — {t(band)}
      </span>
    </div>
  );
}

export async function RecommendationPill({ recommendation }: { recommendation: string }) {
  const t = await getTranslations("Enums.recommendation");
  const code = (recommendation in RECOMMENDATION_STYLE ? recommendation : "CONSIDER") as RecommendationCode;
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold border rounded-full px-2.5 py-1 ${RECOMMENDATION_STYLE[code]}`}
    >
      {t(RECOMMENDATION_KEY[code])}
    </span>
  );
}
