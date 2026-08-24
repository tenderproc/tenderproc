"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { TenderNotice } from "@/lib/types";
import { MatchScore } from "@/lib/scoring";

interface ScoreContextValue {
  scores: Record<string, MatchScore>;
  loading: boolean;
}

const ScoreContext = createContext<ScoreContextValue>({ scores: {}, loading: false });

export function useMatchScore(publicationNumber: string): ScoreContextValue & { score?: MatchScore } {
  const { scores, loading } = useContext(ScoreContext);
  return { scores, loading, score: scores[publicationNumber] };
}

// Fetches match scores for the given tenders in the background after the
// tender list has already rendered (see app/opportunities/page.tsx), instead
// of the page blocking on a batch AI call before showing anything. `enabled`
// gates the fetch for logged-out users, who never have scores.
//
// Also owns the `minScore` filter's status messaging: individual cards hide
// themselves via MatchFilterGate (reading this same context), but only this
// component has the full tender list needed to tell "still loading" apart
// from "loaded, and nothing matched."
export default function OpportunitiesScores({
  tenders,
  enabled,
  children,
}: {
  tenders: TenderNotice[];
  enabled: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("Opportunities");
  const searchParams = useSearchParams();
  const minScoreParam = searchParams.get("minScore");
  const minScore = minScoreParam ? Number(minScoreParam) : null;

  const [scores, setScores] = useState<Record<string, MatchScore>>({});
  const [loading, setLoading] = useState(enabled && tenders.length > 0);

  useEffect(() => {
    if (!enabled || tenders.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/opportunities/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenders }),
    })
      .then((res) => (res.ok ? res.json() : { scores: {} }))
      .then((data) => {
        if (!cancelled) setScores(data.scores ?? {});
      })
      .catch(() => {
        if (!cancelled) setScores({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch only when the actual set of tenders on the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tenders.map((t) => t.publicationNumber).join(",")]);

  const matchedCount =
    minScore !== null
      ? tenders.filter((tender) => {
          const s = scores[tender.publicationNumber];
          return s !== undefined && s.score >= minScore;
        }).length
      : tenders.length;

  return (
    <ScoreContext.Provider value={{ scores, loading }}>
      {minScore !== null && loading && (
        <p className="text-sm text-inkDim mb-4">{t("filteringByMatch")}</p>
      )}
      {minScore !== null && !loading && matchedCount === 0 && tenders.length > 0 && (
        <div className="border border-line rounded-2xl p-8 text-center mb-4">
          <p className="text-inkDim">{t("noMatchResults")}</p>
        </div>
      )}
      {children}
    </ScoreContext.Provider>
  );
}
