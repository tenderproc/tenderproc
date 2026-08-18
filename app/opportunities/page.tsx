import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import SearchFilters from "@/components/SearchFilters";
import TenderCard from "@/components/TenderCard";
import PreferencesSidebar from "@/components/PreferencesSidebar";
import { searchBelgianTenders } from "@/lib/ted";
import { sectorsToCpvPrefixes } from "@/lib/sectors";
import { createClient } from "@/lib/supabase/server";
import { TenderNotice } from "@/lib/types";
import { MatchScore } from "@/lib/scoring";
import { getMatchScores } from "@/lib/matchScoreCache";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cpv?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("Opportunities");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedSectors: string[] = [];
  let savedLanguage: string | null = null;
  let companyDescription = "";
  let address = "";
  let companySize = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("sectors, language, company_description, address, company_size")
      .eq("id", user.id)
      .maybeSingle();
    savedSectors = profile?.sectors ?? [];
    savedLanguage = profile?.language ?? null;
    companyDescription = profile?.company_description ?? "";
    address = profile?.address ?? "";
    companySize = profile?.company_size ?? "";
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

  let tenders: TenderNotice[] = [];
  let loadError: string | null = null;
  try {
    tenders = await searchBelgianTenders({
      keyword: params.q,
      cpv: params.cpv,
      cpvPrefixes,
      languageKeys,
      filterLanguageKeys,
      onlyOpenCalls: true,
      limit: 25,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : t("couldNotReachTed");
  }

  let scores: Record<string, MatchScore> = {};
  if (user && tenders.length > 0) {
    scores = await getMatchScores(supabase, user.id, tenders, {
      sectors: savedSectors,
      languages: savedLanguage ? [savedLanguage] : [],
      description: companyDescription,
      address,
      companySize,
    });
  }

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

          <SearchFilters />

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

          <div>
            {tenders.map((tender) => (
              <TenderCard
                key={tender.publicationNumber}
                tender={tender}
                score={scores[tender.publicationNumber]}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
