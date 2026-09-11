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
  const { score, loading, minScore, failed } = useMatchScore(publicationNumber);

  if (minScore !== null) {
    if (loading) return null;
    // When scoring itself failed, fall back to showing everything rather than
    // hiding every card for lack of a score — see OpportunitiesScores.tsx's
    // "matchingUnavailable" banner, which tells the user why nothing is
    // filtered right now.
    if (!failed && (!score || score.score < minScore)) return null;
  }

  return <>{children}</>;
}
