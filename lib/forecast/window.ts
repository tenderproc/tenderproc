export const DEFAULT_FORECAST_WINDOW_MONTHS = 12;
export const MAX_FORECAST_WINDOW_MONTHS = 24;
export const FORECAST_WINDOW_OPTIONS = [6, 12, 18, 24] as const;

/** Clamps a raw `?months=` query value into [1, MAX_FORECAST_WINDOW_MONTHS], defaulting when absent/invalid — never trusts the query string directly into a date-range DB query. */
export function resolveForecastWindowMonths(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = value ? Number(value) : DEFAULT_FORECAST_WINDOW_MONTHS;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_FORECAST_WINDOW_MONTHS;
  return Math.min(Math.round(n), MAX_FORECAST_WINDOW_MONTHS);
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Today's date and the window's end date, both YYYY-MM-DD (UTC) — the bounds a /forecast query filters estimated_expiry_date between. */
export function forecastWindowBounds(windowMonths: number, now: Date = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return { from: today, to: addMonths(today, windowMonths) };
}
