"use client";

import { useTranslations } from "next-intl";
import { MatchScore, matchLabel } from "@/lib/scoring";

const BAND_STYLE = [
  { min: 85, className: "bg-moss/10 border-moss/25 text-moss" },
  { min: 65, className: "bg-accent/10 border-accent/25 text-accent" },
  { min: 40, className: "bg-gold/10 border-gold/25 text-gold" },
  { min: 0, className: "bg-stamp/10 border-stamp/25 text-stamp" },
];

function bandClassName(score: number): string {
  return BAND_STYLE.find((b) => score >= b.min)!.className;
}

// Client-side twin of MatchScoreBadge (server component) — used by
// MatchScoreSlot to render a score once it arrives asynchronously from
// /api/opportunities/scores, since a server component can't be re-rendered
// from client-side state after the initial page load.
export default function MatchScoreBadgeClient({ score }: { score: MatchScore }) {
  const t = useTranslations("Enums.tedMatchLabel");
  const tCard = useTranslations("MatchScoreBadge");
  const label = matchLabel(score.score, t);
  const metCount = score.criteria.filter((c) => c.met).length;

  return (
    <div className="mt-2">
      <div
        className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 ${bandClassName(score.score)}`}
        title={score.criteria.map((c) => `${c.met ? "✓" : "✗"} ${c.label}`).join("\n")}
      >
        <span className="text-xs font-semibold">
          {score.score}/100 — {label}
        </span>
        {score.criteria.length > 0 && (
          <span className="text-[11px] opacity-80">
            · {tCard("criteriaCount", { met: metCount, total: score.criteria.length })}
          </span>
        )}
      </div>
      {score.summary && (
        <p className="text-xs text-inkDim mt-1.5 max-w-md leading-snug">{score.summary}</p>
      )}
    </div>
  );
}
