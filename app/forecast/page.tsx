import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import ForecastCard from "@/components/ForecastCard";
import ForecastWindowSelect from "@/components/ForecastWindowSelect";
import ForecastDisclaimer from "@/components/ForecastDisclaimer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { filterAwardsBySector } from "@/lib/forecast/matching";
import { mapRowToForecastAward } from "@/lib/forecast/types";
import { resolveForecastWindowMonths, forecastWindowBounds } from "@/lib/forecast/window";

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("ForecastPage");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedSectors: string[] = [];
  if (user) {
    // Reads companies.sector_keys directly rather than going through
    // getSavedCompanyProfile() (this page only needs the sector list, not
    // the full CompanyProfile) — but must read the same source that page
    // does, so this stays in sync with Opportunities/matching. See
    // lib/companyProfile.ts.
    const { data: company } = await supabase
      .from("companies")
      .select("sector_keys")
      .eq("user_id", user.id)
      .maybeSingle();
    savedSectors = company?.sector_keys ?? [];
  }

  const windowMonths = resolveForecastWindowMonths(params.months);
  const { from, to } = forecastWindowBounds(windowMonths);

  // contract_awards has no user-facing RLS policy (shared reference data,
  // same precedent as the ingest-awards cron) — read via the service-role
  // client, same as app/my-tenders/[tenderId]/page.tsx already does for its
  // own contract_awards lookup.
  const admin = createAdminClient();
  const { data: rows, error: loadError } = await admin
    .from("contract_awards")
    .select(
      "id, source_reference, contracting_authority, cpv_codes, award_date, winner_name, award_value, award_value_currency, source_url, raw_title, contract_duration_months, duration_confidence, estimated_expiry_date"
    )
    .eq("source", "ted")
    .gte("estimated_expiry_date", from)
    .lte("estimated_expiry_date", to)
    .order("estimated_expiry_date", { ascending: true })
    .limit(200);

  const allAwards = (rows ?? [])
    .map(mapRowToForecastAward)
    .filter((a): a is NonNullable<typeof a> => a !== null);
  const awards = filterAwardsBySector(allAwards, savedSectors);

  return (
    <div>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
            {t("eyebrow")}
          </p>
          <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
            {t("heading")}
          </h1>
          <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">{t("description")}</p>
        </div>

        <div className="mb-6">
          <ForecastDisclaimer />
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <ForecastWindowSelect months={windowMonths} />
          <p className="text-xs text-inkDim">
            {t("resultCount", { count: awards.length })}
          </p>
        </div>

        {loadError && (
          <div className="border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp mb-8">
            {t("loadError", { loadError: loadError.message })}
          </div>
        )}

        {!loadError && awards.length === 0 && (
          <div className="border border-line rounded-2xl p-8 text-center">
            <p className="text-inkDim">{t("noResults")}</p>
          </div>
        )}

        {!loadError && awards.length > 0 && (
          <div>
            {awards.map((award) => (
              <ForecastCard key={award.id} award={award} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
