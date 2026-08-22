import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import MarketSubNav from "@/components/MarketSubNav";
import MarketShareSection from "@/components/MarketShareSection";
import FollowCompanyButton from "@/components/FollowCompanyButton";
import { searchAwardedTenders } from "@/lib/ted";
import { AwardedTender } from "@/lib/types";
import { INTL_LOCALE, type Locale } from "@/lib/locales";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { filterAwardsBySector } from "@/lib/forecast/matching";
import { mapRowToMarketShareAward } from "@/lib/marketShare/types";
import { computeMarketShare } from "@/lib/marketShare/compute";
import { normalizeCompanyName } from "@/lib/companies/normalize";
import { resolveMarketShareWindowMonths, marketShareWindowSince } from "@/lib/marketShare/window";

export const dynamic = "force-dynamic";

interface Rollup {
  name: string;
  count: number;
  total: number;
}

function topBy(awards: AwardedTender[], keyFn: (a: AwardedTender) => string, n = 5): Rollup[] {
  const map = new Map<string, Rollup>();
  for (const a of awards) {
    const name = keyFn(a);
    const entry = map.get(name) ?? { name, count: 0, total: 0 };
    entry.count += 1;
    entry.total += a.valueRaw ?? 0;
    map.set(name, entry);
  }
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ shareSectors?: string; shareMonths?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("Market");
  const locale = (await getLocale()) as Locale;

  function formatDate(d: string | null) {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString(INTL_LOCALE[locale], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatEur(n: number) {
    return `EUR ${new Intl.NumberFormat(INTL_LOCALE[locale]).format(Math.round(n))}`;
  }

  let awards: AwardedTender[] = [];
  let loadError: string | null = null;
  try {
    awards = await searchAwardedTenders({ limit: 100, daysBack: 90 });
  } catch (err) {
    loadError = err instanceof Error ? err.message : t("couldNotReachTed");
  }

  const topWinners = topBy(awards, (a) => a.winnerName);
  const topBuyers = topBy(awards, (a) => a.buyerName);

  // Market Share (separate from the 90-day live rollups above): sourced from
  // the ingested contract_awards table via the service-role client, same
  // pattern as app/forecast/page.tsx, since it needs real history (12mo+)
  // rather than a live 90-day snapshot.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedSectors: string[] = [];
  let ownNormalizedName: string | null = null;
  if (user) {
    const [{ data: profile }, { data: company }] = await Promise.all([
      supabase.from("profiles").select("sectors, company_name").eq("id", user.id).maybeSingle(),
      supabase.from("companies").select("name").eq("user_id", user.id).maybeSingle(),
    ]);
    savedSectors = profile?.sectors ?? [];
    const ownName = company?.name ?? profile?.company_name ?? null;
    ownNormalizedName = ownName ? normalizeCompanyName(ownName) || null : null;
  }

  const selectedSectors = params.shareSectors ? params.shareSectors.split(",").filter(Boolean) : savedSectors;
  const shareWindowMonths = resolveMarketShareWindowMonths(params.shareMonths);
  const sinceDate = marketShareWindowSince(shareWindowMonths);

  const admin = createAdminClient();
  const { data: shareRows, error: shareError } = await admin
    .from("contract_awards")
    .select("winner_name, award_value, cpv_codes")
    .eq("source", "ted")
    .gte("award_date", sinceDate)
    .limit(5000);

  const allShareAwards = (shareRows ?? []).map(mapRowToMarketShareAward);
  const sectorFilteredAwards = filterAwardsBySector(allShareAwards, selectedSectors);
  const marketShare = computeMarketShare(sectorFilteredAwards);

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
          <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">
            {t("description")}
          </p>
        </div>

        <MarketSubNav active="overview" />

        <MarketShareSection
          rows={marketShare.rows}
          totalValue={marketShare.totalValue}
          ownNormalizedName={ownNormalizedName}
          selectedSectors={selectedSectors}
          months={shareWindowMonths}
          formatEur={formatEur}
        />
        {shareError && (
          <div className="border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp mb-8">
            {t("loadError", { loadError: shareError.message })}
          </div>
        )}

        {loadError && (
          <div className="border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp mb-8">
            {t("loadError", { loadError })}
          </div>
        )}

        {!loadError && (
          <>
            <div className="grid sm:grid-cols-2 gap-4 mb-10">
              <RollupPanel title={t("topWinners")} rows={topWinners} formatEur={formatEur} t={t} />
              <RollupPanel title={t("topBuyers")} rows={topBuyers} formatEur={formatEur} t={t} />
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">
              {t("recentAwards")} · {awards.length}
            </p>

            {awards.length === 0 && (
              <div className="border border-line rounded-2xl p-8 text-center">
                <p className="text-inkDim">{t("noAwards")}</p>
              </div>
            )}

            <div>
              {awards.map((a) => (
                <div
                  key={a.publicationNumber}
                  className="relative border-b border-line py-4 hover:bg-paperDim transition-colors -mx-4 px-4 rounded-doc"
                >
                  {/* Stretched link (same pattern as components/TenderCard.tsx) so the
                      row stays click-anywhere while FollowCompanyButton below remains
                      independently clickable in its own stacking context. */}
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 rounded-doc"
                    aria-label={a.winnerName}
                  />
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-inkDim mb-1">
                        {t("awarded", { date: formatDate(a.publicationDate) })}
                      </p>
                      <h3 className="font-display font-semibold text-base text-ink leading-snug">
                        {a.winnerName}
                      </h3>
                      <p className="text-sm text-inkDim mt-1">
                        {t("buyerLine", { title: a.title, buyer: a.buyerName })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-inkDim uppercase tracking-wide">{t("value")}</p>
                      <p className="text-sm text-ink font-medium">{a.value ?? "—"}</p>
                    </div>
                  </div>
                  <div className="relative z-10 mt-3 inline-block">
                    <FollowCompanyButton companyName={a.winnerName} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function RollupPanel({
  title,
  rows,
  formatEur,
  t,
}: {
  title: string;
  rows: Rollup[];
  formatEur: (n: number) => string;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  return (
    <div className="border border-line rounded-2xl bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-inkDim">{t("notEnoughData")}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink truncate">
                {i + 1}. {r.name}
              </span>
              <span className="text-inkDim shrink-0 flex items-center gap-2">
                {r.total > 0 ? formatEur(r.total) : "—"} · {t("awardCount", { count: r.count })}
                <FollowCompanyButton companyName={r.name} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
