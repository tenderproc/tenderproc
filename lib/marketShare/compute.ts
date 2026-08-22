import { normalizeCompanyName } from "@/lib/companies/normalize";
import { MarketShareAward } from "./types";

export interface MarketShareRow {
  normalizedName: string;
  displayName: string;
  totalValue: number;
  awardCount: number;
  /** 0..1, this company's totalValue / the result's totalValue (0 when totalValue is 0). */
  share: number;
}

export interface MarketShareResult {
  totalValue: number;
  rows: MarketShareRow[];
}

/**
 * Ranks companies by share of total awarded value within a set of
 * already sector/window-filtered contract_awards rows. Groups by
 * normalized winner name (lib/companies/normalize.ts) — legal-suffix,
 * casing, and whitespace differences collapse into one company. Two
 * genuinely different companies that happen to normalize identically
 * would incorrectly merge; fuzzy/typo-tolerant matching is a possible
 * later improvement if that proves to be a real problem in practice.
 * Awards with no winner name or a non-positive value are excluded from
 * both the numerator and the total — they carry no attributable share.
 */
export function computeMarketShare(awards: MarketShareAward[]): MarketShareResult {
  const groups = new Map<string, { displayName: string; totalValue: number; awardCount: number }>();
  let totalValue = 0;

  for (const award of awards) {
    if (!award.winnerName || !award.awardValue || award.awardValue <= 0) continue;
    const normalizedName = normalizeCompanyName(award.winnerName);
    if (!normalizedName) continue;

    totalValue += award.awardValue;
    const existing = groups.get(normalizedName);
    if (existing) {
      existing.totalValue += award.awardValue;
      existing.awardCount += 1;
    } else {
      groups.set(normalizedName, {
        displayName: award.winnerName.trim(),
        totalValue: award.awardValue,
        awardCount: 1,
      });
    }
  }

  const rows: MarketShareRow[] = Array.from(groups.entries()).map(([normalizedName, g]) => ({
    normalizedName,
    displayName: g.displayName,
    totalValue: g.totalValue,
    awardCount: g.awardCount,
    share: totalValue > 0 ? g.totalValue / totalValue : 0,
  }));

  // Ties (equal totalValue, and therefore equal share) are broken by
  // display name so ranking is deterministic rather than depending on
  // Map insertion/iteration order.
  rows.sort((a, b) => b.totalValue - a.totalValue || a.displayName.localeCompare(b.displayName));

  return { totalValue, rows };
}
