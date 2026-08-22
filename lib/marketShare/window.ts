export const DEFAULT_MARKET_SHARE_WINDOW_MONTHS = 12;
export const MARKET_SHARE_WINDOW_OPTIONS = [3, 6, 12, 24] as const;
const MAX_MARKET_SHARE_WINDOW_MONTHS = 60;

/** Clamps a raw `?months=` query value into [1, MAX_MARKET_SHARE_WINDOW_MONTHS], defaulting when absent/invalid — mirrors lib/forecast/window.ts's resolveForecastWindowMonths. */
export function resolveMarketShareWindowMonths(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = value ? Number(value) : DEFAULT_MARKET_SHARE_WINDOW_MONTHS;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MARKET_SHARE_WINDOW_MONTHS;
  return Math.min(Math.round(n), MAX_MARKET_SHARE_WINDOW_MONTHS);
}

function subtractMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** The award_date lower bound (YYYY-MM-DD, UTC) for a market-share window of this many months ending today. */
export function marketShareWindowSince(windowMonths: number, now: Date = new Date()): string {
  return subtractMonths(now.toISOString().slice(0, 10), windowMonths);
}
