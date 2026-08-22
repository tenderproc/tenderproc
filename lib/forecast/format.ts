/** "Q2 2027"-style label for an estimated re-tender window — the level of precision the forecast actually supports (a month-exact date would overstate confidence in an estimate). */
export function quarterLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${d.getUTCFullYear()}`;
}
