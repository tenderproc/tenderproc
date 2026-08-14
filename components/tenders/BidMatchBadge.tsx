const BAND_STYLE: Record<string, string> = {
  "Strong match": "bg-moss/10 border-moss/25 text-moss",
  "Good match": "bg-accent/10 border-accent/25 text-accent",
  "Moderate match": "bg-gold/10 border-gold/25 text-gold",
  "Weak match": "bg-stamp/10 border-stamp/25 text-stamp",
};

const RECOMMENDATION_STYLE: Record<string, string> = {
  BID: "bg-moss/10 border-moss/25 text-moss",
  CONSIDER: "bg-gold/10 border-gold/25 text-gold",
  "NO-BID": "bg-stamp/10 border-stamp/25 text-stamp",
};

export function MatchScorePill({ score, matchLabel }: { score: number; matchLabel: string }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 ${BAND_STYLE[matchLabel] ?? BAND_STYLE["Weak match"]}`}
    >
      <span className="text-sm font-semibold">
        {score}/100 — {matchLabel}
      </span>
    </div>
  );
}

export function RecommendationPill({ recommendation }: { recommendation: string }) {
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold border rounded-full px-2.5 py-1 ${RECOMMENDATION_STYLE[recommendation] ?? RECOMMENDATION_STYLE.CONSIDER}`}
    >
      {recommendation}
    </span>
  );
}
