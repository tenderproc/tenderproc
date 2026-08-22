import { describe, expect, it } from "vitest";
import { computeMarketShare } from "@/lib/marketShare/compute";
import { MarketShareAward } from "@/lib/marketShare/types";

function award(winnerName: string | null, awardValue: number | null): MarketShareAward {
  return { winnerName, awardValue, cpvCodes: [] };
}

describe("computeMarketShare", () => {
  it("sums total value and computes each company's share", () => {
    const result = computeMarketShare([award("Acme NV", 300_000), award("Beta SA", 700_000)]);

    expect(result.totalValue).toBe(1_000_000);
    expect(result.rows).toHaveLength(2);

    const acme = result.rows.find((r) => r.displayName === "Acme NV");
    const beta = result.rows.find((r) => r.displayName === "Beta SA");
    expect(acme?.share).toBeCloseTo(0.3);
    expect(beta?.share).toBeCloseTo(0.7);
    // Ranked descending by share.
    expect(result.rows[0].displayName).toBe("Beta SA");
  });

  it("groups normalized-equivalent winner names into one company", () => {
    const result = computeMarketShare([
      award("Acme Trucks NV", 100_000),
      award("ACME TRUCKS N.V.", 50_000),
      award("acme trucks nv", 25_000),
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].totalValue).toBe(175_000);
    expect(result.rows[0].awardCount).toBe(3);
    expect(result.rows[0].share).toBeCloseTo(1);
    // Display name comes from the first award seen for the group.
    expect(result.rows[0].displayName).toBe("Acme Trucks NV");
  });

  it("breaks ties in totalValue by display name for a deterministic order", () => {
    const result = computeMarketShare([award("Zeta NV", 500_000), award("Alpha NV", 500_000)]);

    expect(result.rows.map((r) => r.displayName)).toEqual(["Alpha NV", "Zeta NV"]);
    expect(result.rows[0].share).toBeCloseTo(0.5);
    expect(result.rows[1].share).toBeCloseTo(0.5);
  });

  it("returns zero totalValue and no rows for an empty award list, without dividing by zero", () => {
    const result = computeMarketShare([]);
    expect(result.totalValue).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it("excludes awards with no winner name or a non-positive value from the total and rows", () => {
    const result = computeMarketShare([
      award(null, 100_000),
      award("Acme NV", null),
      award("Acme NV", 0),
      award("Acme NV", -5),
      award("Beta SA", 200_000),
    ]);

    expect(result.totalValue).toBe(200_000);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].displayName).toBe("Beta SA");
    expect(result.rows[0].share).toBeCloseTo(1);
  });

  it("results in an all-zero-share, empty-rows result when every award is excluded", () => {
    const result = computeMarketShare([award(null, 100_000), award("Acme NV", 0)]);
    expect(result.totalValue).toBe(0);
    expect(result.rows).toEqual([]);
  });
});
