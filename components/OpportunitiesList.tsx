import { getTranslations } from "next-intl/server";
import TenderCard from "@/components/TenderCard";
import OpportunitiesScores from "@/components/OpportunitiesScores";
import MatchFilterGate from "@/components/MatchFilterGate";
import { searchBelgianTenders } from "@/lib/ted";
import { searchBosaTenders } from "@/lib/bosa";
import { getExternalOpportunities } from "@/lib/externalOpportunities";
import { sectorsToCpvPrefixes } from "@/lib/sectors";

// Same per-source cap TED/BOSA already use (limit: 50 below) — keeps a single
// scoring request to a handful of parallel chunks instead of dozens.
const MATCH_SCORE_LIMIT = 50;

/**
 * The slow half of the Opportunities page: TED and BOSA are both live,
 * unpaginated-per-request external APIs (measured 1.5-2.5s+ each, BOSA
 * worst-case doing a fresh OAuth handshake on a cold serverless instance)
 * merged with the DB-backed regional sources. Split out from page.tsx and
 * rendered behind a <Suspense> boundary there so the header, sidebar, and
 * filters — which only depend on the fast Supabase auth/profile lookups —
 * paint immediately instead of waiting behind this fetch too.
 */
export default async function OpportunitiesList({
  params,
  savedSectors,
  savedLanguage,
  freeNoSectorSelected,
  showMatchFilter,
  hasUser,
}: {
  params: { q?: string; cpv?: string; minScore?: string };
  savedSectors: string[];
  savedLanguage: string | null;
  freeNoSectorSelected: boolean;
  showMatchFilter: boolean;
  hasUser: boolean;
}) {
  const t = await getTranslations("Opportunities");

  const cpvPrefixes = !params.cpv && savedSectors.length > 0
    ? sectorsToCpvPrefixes(savedSectors)
    : undefined;
  const languageKeys = savedLanguage ? [savedLanguage] : undefined;
  const filterLanguageKeys = savedLanguage ? [savedLanguage] : undefined;

  const [tedResult, bosaResult, externalResult] = freeNoSectorSelected
    ? [
        { status: "fulfilled" as const, value: [] },
        { status: "fulfilled" as const, value: [] },
        { status: "fulfilled" as const, value: [] },
      ]
    : await Promise.allSettled([
        searchBelgianTenders({
          keyword: params.q,
          cpv: params.cpv,
          cpvPrefixes,
          languageKeys,
          filterLanguageKeys,
          onlyOpenCalls: true,
          limit: 50,
        }),
        searchBosaTenders({ keyword: params.q, limit: 50, onlyOpenCalls: true, filterLanguageKeys, cpvPrefixes }),
        getExternalOpportunities(),
      ]);

  const loadErrors: string[] = [];
  const tedTenders = tedResult.status === "fulfilled" ? tedResult.value : [];
  if (tedResult.status === "rejected") {
    loadErrors.push(tedResult.reason instanceof Error ? tedResult.reason.message : t("couldNotReachTed"));
  }
  const bosaTenders = bosaResult.status === "fulfilled" ? bosaResult.value : [];
  if (bosaResult.status === "rejected") {
    loadErrors.push(bosaResult.reason instanceof Error ? bosaResult.reason.message : "BOSA: could not load");
  }
  let externalTenders = externalResult.status === "fulfilled" ? externalResult.value : [];
  if (externalResult.status === "rejected") {
    loadErrors.push(externalResult.reason instanceof Error ? externalResult.reason.message : "Regional sources: could not load");
  }
  if (params.cpv) {
    externalTenders = [];
  } else if (params.q) {
    const q = params.q.toLowerCase();
    externalTenders = externalTenders.filter(
      (t) => t.title.toLowerCase().includes(q) || t.buyerName.toLowerCase().includes(q)
    );
  }
  if (filterLanguageKeys?.length) {
    externalTenders = externalTenders.filter((t) => t.titleLanguages.some((l) => filterLanguageKeys.includes(l)));
  }

  const tenders = [...tedTenders, ...bosaTenders, ...externalTenders].sort((a, b) => {
    if (!a.publicationDate) return 1;
    if (!b.publicationDate) return -1;
    return b.publicationDate.localeCompare(a.publicationDate);
  });
  const loadError = loadErrors.length > 0 ? loadErrors.join(" — ") : null;

  // TED and BOSA are already capped at 50 each, but the regional sources
  // (lib/externalOpportunities.ts) aren't — merged, this can reach ~235
  // tenders. Sending all of them to /api/opportunities/scores in one request
  // means a burst of ~24 parallel Claude calls (10/chunk) that the "Filtering
  // by match %…" state waits on as a single unit — slow, and one bad chunk
  // stalls the rest. Score only the most recent MATCH_SCORE_LIMIT; the full
  // list still renders as cards (MatchScoreSlot already renders nothing for
  // an unscored tender), it's only the match-% filter/badge that's capped.
  const scoredTenders = tenders.slice(0, MATCH_SCORE_LIMIT);

  return (
    <>
      {loadError && (
        <div className="border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp">
          {t("loadError", { loadError })}
        </div>
      )}

      {!loadError && freeNoSectorSelected && (
        <div className="border border-line rounded-2xl p-8 text-center">
          <p className="text-inkDim">{t("noSectorSelected")}</p>
        </div>
      )}

      {!loadError && !freeNoSectorSelected && tenders.length === 0 && (
        <div className="border border-line rounded-2xl p-8 text-center">
          <p className="text-inkDim">{t("noResults")}</p>
        </div>
      )}

      <OpportunitiesScores tenders={scoredTenders} enabled={hasUser} defaultFilter={showMatchFilter}>
        <div>
          {tenders.map((tender) => (
            <MatchFilterGate key={tender.publicationNumber} publicationNumber={tender.publicationNumber}>
              <TenderCard tender={tender} />
            </MatchFilterGate>
          ))}
        </div>
      </OpportunitiesScores>
    </>
  );
}
