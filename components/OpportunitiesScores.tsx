"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { TenderNotice } from "@/lib/types";
import { MatchScore, MATCH_BAND_MIN_SCORE } from "@/lib/scoring";

interface ScoreContextValue {
  scores: Record<string, MatchScore>;
  loading: boolean;
  minScore: number | null;
}

const ScoreContext = createContext<ScoreContextValue>({ scores: {}, loading: false, minScore: null });

export function useMatchScore(publicationNumber: string): ScoreContextValue & { score?: MatchScore } {
  const { scores, loading, minScore } = useContext(ScoreContext);
  return { scores, loading, minScore, score: scores[publicationNumber] };
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
  defaultFilter,
  children,
}: {
  tenders: TenderNotice[];
  enabled: boolean;
  // True when the user has a sector/profile signal (see hasProfileSignal in
  // lib/scoring.ts). Sets the "screens out the noise" pitch's implicit
  // default: with no explicit `minScore` in the URL, weak matches (below the
  // "possible" band) are filtered out of the primary feed rather than
  // defaulting to unfiltered "Any" — otherwise sector-filtered users land on
  // a feed where obviously-irrelevant, AI-flagged-as-weak notices can sit at
  // the top just because nothing acts on the score by default.
  defaultFilter: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("Opportunities");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const minScoreParam = searchParams.get("minScore");
  const minScore =
    minScoreParam === "any"
      ? null
      : minScoreParam
        ? Number(minScoreParam)
        : defaultFilter
          ? MATCH_BAND_MIN_SCORE.possible
          : null;

  const shouldFetch = enabled && tenders.length > 0;
  // Locale is part of the key so switching the UI language re-fetches scores
  // in the new language instead of leaving the previous language's summaries
  // on screen (see scoreTenders' language instruction in lib/scoring.ts).
  const tendersKey = `${locale}:${tenders.map((t) => t.publicationNumber).join(",")}`;

  const [scores, setScores] = useState<Record<string, MatchScore>>({});
  // Tracks which tendersKey the current `scores` reflect, so `loading` can be
  // derived during render instead of toggled via a setState call in the
  // effect body (which trips react-hooks/set-state-in-effect).
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const loading = shouldFetch && completedKey !== tendersKey;

  useEffect(() => {
    if (!shouldFetch) return;
    let cancelled = false;
    fetch("/api/opportunities/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenders, locale }),
    })
      .then((res) => (res.ok ? res.json() : { scores: {} }))
      .then((data) => {
        if (!cancelled) {
          setScores(data.scores ?? {});
          setCompletedKey(tendersKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScores({});
          setCompletedKey(tendersKey);
        }
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch only when the actual set of tenders on the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFetch, tendersKey]);

  const matchedCount =
    minScore !== null
      ? tenders.filter((tender) => {
          const s = scores[tender.publicationNumber];
          return s !== undefined && s.score >= minScore;
        }).length
      : tenders.length;

  return (
    <ScoreContext.Provider value={{ scores, loading, minScore }}>
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
