import Header from "@/components/Header";
import { searchAwardedTenders } from "@/lib/ted";
import { AwardedTender } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

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

function formatEur(n: number) {
  return `EUR ${new Intl.NumberFormat("en-BE").format(Math.round(n))}`;
}

export default async function MarketPage() {
  let awards: AwardedTender[] = [];
  let loadError: string | null = null;
  try {
    awards = await searchAwardedTenders({ limit: 100, daysBack: 90 });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Couldn't reach TED.";
  }

  const topWinners = topBy(awards, (a) => a.winnerName);
  const topBuyers = topBy(awards, (a) => a.buyerName);

  return (
    <div>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
            Last 90 days · Source: TED contract award notices
          </p>
          <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
            Market overview
          </h1>
          <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">
            Recently-awarded Belgian public contracts — who won, for how
            much, and from whom. This is a snapshot of recent awards, not a
            full historical archive.
          </p>
        </div>

        {loadError && (
          <div className="border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp mb-8">
            Couldn't load award data right now ({loadError}). Try again in a
            moment.
          </div>
        )}

        {!loadError && (
          <>
            <div className="grid sm:grid-cols-2 gap-4 mb-10">
              <RollupPanel title="Top winners by awarded value" rows={topWinners} />
              <RollupPanel title="Top buyers by spend" rows={topBuyers} />
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">
              Recent awards · {awards.length}
            </p>

            {awards.length === 0 && (
              <div className="border border-line rounded-2xl p-8 text-center">
                <p className="text-inkDim">No award notices found in this window.</p>
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
                        Awarded {formatDate(a.publicationDate)}
                      </p>
                      <h3 className="font-display font-semibold text-base text-ink leading-snug">
                        {a.winnerName}
                      </h3>
                      <p className="text-sm text-inkDim mt-1">
                        {a.title} · buyer: {a.buyerName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-inkDim uppercase tracking-wide">Value</p>
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

function RollupPanel({ title, rows }: { title: string; rows: Rollup[] }) {
  return (
    <div className="border border-line rounded-2xl bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-inkDim">Not enough data yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink truncate">
                {i + 1}. {r.name}
              </span>
              <span className="text-inkDim shrink-0">
                {r.total > 0 ? formatEur(r.total) : "—"} · {r.count} award
                {r.count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
