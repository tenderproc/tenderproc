"use client";

import { useMatchScore } from "./OpportunitiesScores";

// Hides a single TenderCard when a match-score filter is active (either an
// explicit `minScore` in the URL, or the implicit default applied by
// OpportunitiesScores — see its `defaultFilter` prop) and the tender's
// async-fetched match score doesn't meet it. Hides everything while scores
// are still loading rather than flashing the unfiltered list first.
export default function MatchFilterGate({
  publicationNumber,
  children,
}: {
  publicationNumber: string;
  children: React.ReactNode;
}) {
  const { score, loading, minScore } = useMatchScore(publicationNumber);

  if (minScore !== null) {
    if (loading) return null;
    if (!score || score.score < minScore) return null;
  }

  return <>{children}</>;
}
