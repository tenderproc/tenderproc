"use client";

import { useTranslations } from "next-intl";
import { useMatchScore } from "./OpportunitiesScores";
import MatchScoreBadgeClient from "./MatchScoreBadgeClient";

// Placeholder for a TenderCard's match score while OpportunitiesScores fetches
// it in the background; renders nothing once loaded if there's no score for
// this tender (e.g. no company profile signal yet).
export default function MatchScoreSlot({ publicationNumber }: { publicationNumber: string }) {
  const t = useTranslations("MatchScoreBadge");
  const { score, loading } = useMatchScore(publicationNumber);

  if (score) return <MatchScoreBadgeClient score={score} />;
  if (loading) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 border border-line rounded-full px-2.5 py-1 animate-pulse">
        <span className="text-xs text-inkDim">{t("scoring")}</span>
      </div>
    );
  }
  return null;
}
