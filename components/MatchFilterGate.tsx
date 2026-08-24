"use client";

import { useSearchParams } from "next/navigation";
import { useMatchScore } from "./OpportunitiesScores";

// Hides a single TenderCard when a `minScore` filter is active and the
// tender's async-fetched match score doesn't meet it. Hides everything while
// scores are still loading rather than flashing the unfiltered list first.
export default function MatchFilterGate({
  publicationNumber,
  children,
}: {
  publicationNumber: string;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const minScoreParam = searchParams.get("minScore");
  const { score, loading } = useMatchScore(publicationNumber);

  if (minScoreParam) {
    if (loading) return null;
    const minScore = Number(minScoreParam);
    if (!score || score.score < minScore) return null;
  }

  return <>{children}</>;
}
