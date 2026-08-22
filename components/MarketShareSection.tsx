import { getTranslations } from "next-intl/server";
import FollowCompanyButton from "@/components/FollowCompanyButton";
import MarketShareFilters from "@/components/MarketShareFilters";
import { MarketShareRow } from "@/lib/marketShare/compute";

export default async function MarketShareSection({
  rows,
  totalValue,
  ownNormalizedName,
  selectedSectors,
  months,
  formatEur,
}: {
  rows: MarketShareRow[];
  totalValue: number;
  ownNormalizedName: string | null;
  selectedSectors: string[];
  months: number;
  formatEur: (n: number) => string;
}) {
  const t = await getTranslations("MarketShare");
  const topRows = rows.slice(0, 10);
  const maxShare = topRows[0]?.share ?? 0;

  return (
    <section id="market-share" className="mb-10 scroll-mt-24">
      <h2 className="font-display font-semibold text-xl text-ink mb-1">{t("heading")}</h2>
      <p className="text-xs text-inkDim mb-4 max-w-2xl">{t("disclaimer")}</p>

      <MarketShareFilters selectedSectors={selectedSectors} months={months} />

      <div className="border border-line rounded-2xl bg-white p-5">
        {topRows.length === 0 ? (
          <p className="text-sm text-inkDim">{t("noData")}</p>
        ) : (
          <ol className="space-y-3">
            {topRows.map((row, i) => {
              const isOwn = ownNormalizedName !== null && row.normalizedName === ownNormalizedName;
              const barWidth = maxShare > 0 ? Math.max((row.share / maxShare) * 100, 2) : 0;
              return (
                <li
                  key={row.normalizedName}
                  className={`rounded-doc px-3 py-2 ${isOwn ? "bg-accent/10 ring-1 ring-accent/40" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm mb-1.5">
                    <span className="text-ink truncate flex items-center gap-2">
                      {i + 1}. {row.displayName}
                      {isOwn && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                          {t("you")}
                        </span>
                      )}
                    </span>
                    <span className="text-inkDim shrink-0 flex items-center gap-2">
                      {t("sharePercent", { percent: (row.share * 100).toFixed(1) })} ·{" "}
                      {formatEur(row.totalValue)}
                      <FollowCompanyButton companyName={row.displayName} />
                    </span>
                  </div>
                  <div className="h-1.5 bg-paperDim rounded-full overflow-hidden">
                    <div className="h-full bg-accent/60 rounded-full" style={{ width: `${barWidth}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <p className="text-xs text-inkDim mt-3">{t("totalValue", { value: formatEur(totalValue) })}</p>
    </section>
  );
}
