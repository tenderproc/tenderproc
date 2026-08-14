import Header from "@/components/Header";
import AdvancedSearchForm from "@/components/AdvancedSearchForm";
import TenderCard from "@/components/TenderCard";
import { searchBelgianTenders } from "@/lib/ted";
import { createClient } from "@/lib/supabase/server";
import { TenderNotice } from "@/lib/types";
import { MatchScore } from "@/lib/scoring";
import { getMatchScores } from "@/lib/matchScoreCache";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    cpv?: string;
    valueMin?: string;
    valueMax?: string;
    deadlineAfter?: string;
    deadlineBefore?: string;
  }>;
}) {
  const params = await searchParams;
  const hasQuery = Object.values(params).some(Boolean);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let tenders: TenderNotice[] = [];
  let loadError: string | null = null;
  if (hasQuery) {
    try {
      tenders = await searchBelgianTenders({
        keyword: params.q,
        cpv: params.cpv,
        valueMin: params.valueMin ? Number(params.valueMin) : undefined,
        valueMax: params.valueMax ? Number(params.valueMax) : undefined,
        deadlineAfter: params.deadlineAfter,
        deadlineBefore: params.deadlineBefore,
        onlyOpenCalls: true,
        limit: 50,
      });
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Couldn't reach TED.";
    }
  }

  let scores: Record<string, MatchScore> = {};
  if (user && tenders.length > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("sectors, languages, company_description, address, company_size")
      .eq("id", user.id)
      .maybeSingle();
    scores = await getMatchScores(supabase, user.id, tenders, {
      sectors: profile?.sectors ?? [],
      languages: profile?.languages ?? [],
      description: profile?.company_description ?? "",
      address: profile?.address ?? "",
      companySize: profile?.company_size ?? "",
    });
  }

  return (
    <div>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
            Ad-hoc lookup · Source: TED
          </p>
          <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
            Search
          </h1>
          <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">
            One-off searches across all genuinely open Belgian tenders,
            independent of your saved sectors — filter by keyword, CPV code,
            value range, or deadline.
          </p>
        </div>

        <AdvancedSearchForm />

        {loadError && (
          <div className="border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp">
            Couldn&apos;t load tenders right now ({loadError}). Try again in a
            moment.
          </div>
        )}

        {hasQuery && !loadError && tenders.length === 0 && (
          <div className="border border-line rounded-2xl p-8 text-center">
            <p className="text-inkDim">No notices matched those filters.</p>
          </div>
        )}

        {!hasQuery && (
          <div className="border border-line rounded-2xl p-8 text-center">
            <p className="text-inkDim">
              Enter a keyword, CPV code, value range, or deadline above to
              search.
            </p>
          </div>
        )}

        <div>
          {tenders.map((t) => (
            <TenderCard key={t.publicationNumber} tender={t} score={scores[t.publicationNumber]} />
          ))}
        </div>
      </main>
    </div>
  );
}
