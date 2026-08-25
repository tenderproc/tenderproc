import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import SearchFilters from "@/components/SearchFilters";
import TenderCard from "@/components/TenderCard";
import PreferencesSidebar from "@/components/PreferencesSidebar";
import OpportunitiesScores from "@/components/OpportunitiesScores";
import MatchFilterGate from "@/components/MatchFilterGate";
import { searchBelgianTenders } from "@/lib/ted";
import { searchBosaTenders } from "@/lib/bosa";
import { getExternalOpportunities } from "@/lib/externalOpportunities";
import { sectorsToCpvPrefixes } from "@/lib/sectors";
import { createClient } from "@/lib/supabase/server";
import { getSavedCompanyProfile } from "@/lib/companyProfile";
import { hasProfileSignal } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cpv?: string; minScore?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("Opportunities");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedSectors: string[] = [];
  let savedLanguage: string | null = null;
  let showMatchFilter = false;
  if (user) {
    const saved = await getSavedCompanyProfile(supabase, user.id);
    savedSectors = saved.savedSectors;
    savedLanguage = saved.savedLanguage;
    showMatchFilter = hasProfileSignal(saved.profile);
  }

  // A manual CPV search overrides the saved sector default. The sidebar's
  // language selection is exclusive-single-select (see PreferencesSidebar) —
  // `null` means "All languages" (no filtering); a specific language both
  // filters results to it (filterLanguageKeys, matched against TED's
  // official-language field — see its doc in lib/ted.ts) and becomes the
  // preferred display language (languageKeys).
  const cpvPrefixes = !params.cpv && savedSectors.length > 0
    ? sectorsToCpvPrefixes(savedSectors)
    : undefined;
  const languageKeys = savedLanguage ? [savedLanguage] : undefined;
  const filterLanguageKeys = savedLanguage ? [savedLanguage] : undefined;

  // TED, BOSA, and the three regional Wallonia/Flanders sources are fetched
  // independently and merged here rather than behind one shared function,
  // since they have three different freshness models: TED and BOSA are
  // both live (fetched fresh every load), the regional sources are
  // persisted (scraped weekly — see lib/externalOpportunities.ts). Each
  // source's failure is independent (Promise.allSettled): if e.g. BOSA's
  // API is briefly down, TED and regional results still render rather
  // than the whole page erroring out.
  const [tedResult, bosaResult, externalResult] = await Promise.allSettled([
    searchBelgianTenders({
      keyword: params.q,
      cpv: params.cpv,
      cpvPrefixes,
      languageKeys,
      filterLanguageKeys,
      onlyOpenCalls: true,
      limit: 50,
    }),
    searchBosaTenders({ keyword: params.q, limit: 50, onlyOpenCalls: true, filterLanguageKeys }),
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
  // Explicit-CPV search (params.cpv) can't match regional-source rows —
  // they don't publish CPV codes (council minutes, not eForms notices).
  // Excluding them for that specific search is correct, not a bug: a user
  // searching a precise CPV code wants precise CPV matches.
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

  return (
    <div>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row gap-8">
        {user && (
          <PreferencesSidebar
            userId={user.id}
            initialSectors={savedSectors}
            initialLanguage={savedLanguage}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
              {t("eyebrow")}
            </p>
            <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
              {t("heading")}
            </h1>
            <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">
              {t("description")}
            </p>
          </div>

          <SearchFilters showMatchFilter={showMatchFilter} />

          {loadError && (
            <div className="border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp">
              {t("loadError", { loadError })}
            </div>
          )}

          {!loadError && tenders.length === 0 && (
            <div className="border border-line rounded-2xl p-8 text-center">
              <p className="text-inkDim">{t("noResults")}</p>
            </div>
          )}

          <OpportunitiesScores tenders={tenders} enabled={Boolean(user)}>
            <div>
              {tenders.map((tender) => (
                <MatchFilterGate key={tender.publicationNumber} publicationNumber={tender.publicationNumber}>
                  <TenderCard tender={tender} />
                </MatchFilterGate>
              ))}
            </div>
          </OpportunitiesScores>
        </div>
      </main>
    </div>
  );
}
