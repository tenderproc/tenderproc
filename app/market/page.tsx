import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import { searchAwardedTenders } from "@/lib/ted";
import { AwardedTender } from "@/lib/types";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

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

export default async function MarketPage() {
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

  return (
    <div>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10">
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
                <a
                  key={a.publicationNumber}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border-b border-line py-4 hover:bg-paperDim transition-colors -mx-4 px-4 rounded-doc"
                >
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
                </a>
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
              <span className="text-inkDim shrink-0">
                {r.total > 0 ? formatEur(r.total) : "—"} · {t("awardCount", { count: r.count })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
