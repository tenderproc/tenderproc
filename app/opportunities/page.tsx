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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedSectors: string[] = [];
  let savedLanguages: string[] = [];
  let companyDescription = "";
  let address = "";
  let companySize = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("sectors, languages, company_description, address, company_size")
      .eq("id", user.id)
      .maybeSingle();
    savedSectors = profile?.sectors ?? [];
    savedLanguages = profile?.languages ?? [];
    companyDescription = profile?.company_description ?? "";
    address = profile?.address ?? "";
    companySize = profile?.company_size ?? "";
  }

  // A manual CPV search overrides the saved sector default. Languages don't
  // filter results — TED titles are translated into every EU language, so
  // "preferred languages" instead just controls which translation shows.
  const cpvPrefixes = !params.cpv && savedSectors.length > 0
    ? sectorsToCpvPrefixes(savedSectors)
    : undefined;
  const languageKeys = savedLanguages.length > 0 ? savedLanguages : undefined;

  let tenders: TenderNotice[] = [];
  let loadError: string | null = null;
  try {
    tenders = await searchBelgianTenders({
      keyword: params.q,
      cpv: params.cpv,
      cpvPrefixes,
      languageKeys,
      onlyOpenCalls: true,
      limit: 25,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Couldn't reach TED.";
  }

  let scores: Record<string, MatchScore> = {};
  if (user && tenders.length > 0) {
    scores = await getMatchScores(supabase, user.id, tenders, {
      sectors: savedSectors,
      languages: savedLanguages,
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
            initialLanguages={savedLanguages}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
              Open calls only · Source: TED
            </p>
            <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
              Opportunities
            </h1>
            <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">
              Genuinely open tenders in Belgium, matched to your sectors —
              already-awarded and informational notices are filtered out.
              Pulled from the EU&apos;s official TED database; this beta covers
              notices above the EU publication thresholds.
            </p>
          </div>

          <SearchFilters />

          {loadError && (
            <div className="border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp">
              Couldn&apos;t load tenders right now ({loadError}). Try again in a
              moment.
            </div>
          )}

          {!loadError && tenders.length === 0 && (
            <div className="border border-line rounded-2xl p-8 text-center">
              <p className="text-inkDim">
                No notices matched your sectors or search. Try widening your
                sector selection in the sidebar.
              </p>
            </div>
          )}

          <div>
            {tenders.map((t) => (
              <TenderCard key={t.publicationNumber} tender={t} score={scores[t.publicationNumber]} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
