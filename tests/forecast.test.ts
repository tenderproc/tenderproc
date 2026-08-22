import { describe, expect, it } from "vitest";
import { computeEstimatedExpiry } from "@/lib/forecast/expiry";
import { lookupFallbackDurationMonths } from "@/lib/forecast/durationDefaults";
import { filterAwardsBySector } from "@/lib/forecast/matching";
import { resolveForecastWindowMonths } from "@/lib/forecast/window";
import { parseAwardDurationExtraction } from "@/lib/ai/anthropic-provider";

describe("computeEstimatedExpiry", () => {
  it("prefers a literal TED-stated end date over everything else", () => {
    const result = computeEstimatedExpiry({
      awardDate: "2026-01-01",
      explicitDurationMonths: 99, // should be ignored — end date wins
      explicitExpiryDate: "2030-08-31",
      cpvCodes: ["45000000"],
    });
    expect(result).toEqual({ months: null, confidence: "confirmed", expiryDate: "2030-08-31" });
  });

  it("computes a confirmed expiry from an explicit duration + award date", () => {
    const result = computeEstimatedExpiry({
      awardDate: "2026-01-15",
      explicitDurationMonths: 48,
      explicitExpiryDate: null,
      cpvCodes: [],
    });
    expect(result).toEqual({ months: 48, confidence: "confirmed", expiryDate: "2030-01-15" });
  });

  it("stays confirmed but leaves expiryDate null when duration is known but award_date isn't", () => {
    const result = computeEstimatedExpiry({
      awardDate: null,
      explicitDurationMonths: 36,
      explicitExpiryDate: null,
      cpvCodes: [],
    });
    expect(result).toEqual({ months: 36, confidence: "confirmed", expiryDate: null });
  });

  it("falls back to the CPV typical-duration table as 'estimated' when TED gives nothing explicit", () => {
    const result = computeEstimatedExpiry({
      awardDate: "2026-01-01",
      explicitDurationMonths: null,
      explicitExpiryDate: null,
      cpvCodes: ["90910000"], // cleaning services
    });
    expect(result.confidence).toBe("estimated");
    expect(result.months).toBe(lookupFallbackDurationMonths(["90910000"]));
    expect(result.expiryDate).not.toBeNull();
  });

  it("never guesses: unknown with a null expiry when there's no explicit data and no CPV match", () => {
    const result = computeEstimatedExpiry({
      awardDate: "2026-01-01",
      explicitDurationMonths: null,
      explicitExpiryDate: null,
      cpvCodes: ["99999999"], // not in the fallback table
    });
    expect(result).toEqual({ months: null, confidence: "unknown", expiryDate: null });
  });
});

describe("filterAwardsBySector", () => {
  const awards = [
    { id: "a", cpvCodes: ["45000000"] }, // construction
    { id: "b", cpvCodes: ["90910000"] }, // cleaning
    { id: "c", cpvCodes: ["72000000"] }, // IT
  ];

  it("keeps only awards whose CPV codes fall under the selected sectors' prefixes", () => {
    const result = filterAwardsBySector(awards, ["construction"]);
    expect(result.map((a) => a.id)).toEqual(["a"]);
  });

  it("matches the same CPV-prefix logic Opportunities uses — multiple sectors OR together", () => {
    const result = filterAwardsBySector(awards, ["construction", "it-telecom"]);
    expect(result.map((a) => a.id).sort()).toEqual(["a", "c"]);
  });

  it("shows everything unfiltered when no sectors are selected, same as Opportunities' zero-sector case", () => {
    expect(filterAwardsBySector(awards, [])).toHaveLength(3);
  });

  it("shows everything unfiltered for the 'other' escape-hatch sector, same as Opportunities", () => {
    expect(filterAwardsBySector(awards, ["other"])).toHaveLength(3);
  });
});

describe("resolveForecastWindowMonths", () => {
  it("defaults to 12 months when nothing is passed", () => {
    expect(resolveForecastWindowMonths(undefined)).toBe(12);
  });

  it("accepts a valid value within range", () => {
    expect(resolveForecastWindowMonths("18")).toBe(18);
  });

  it("clamps anything above the 24-month cap", () => {
    expect(resolveForecastWindowMonths("999")).toBe(24);
  });

  it("falls back to the default for garbage input rather than throwing", () => {
    expect(resolveForecastWindowMonths("not-a-number")).toBe(12);
    expect(resolveForecastWindowMonths("-5")).toBe(12);
  });
});

describe("parseAwardDurationExtraction", () => {
  it("parses a well-formed AI extraction", () => {
    const raw = JSON.stringify({
      months: 48,
      reasoning: "2 possible extensions of 1 year each on a 2-year base term.",
    });
    expect(parseAwardDurationExtraction(raw)).toEqual({
      months: 48,
      reasoning: "2 possible extensions of 1 year each on a 2-year base term.",
    });
  });

  it("never fabricates: null months means null reasoning too, regardless of what's in the payload", () => {
    const raw = JSON.stringify({ months: null, reasoning: "some text anyway" });
    expect(parseAwardDurationExtraction(raw)).toEqual({ months: null, reasoning: null });
  });

  it("rounds a non-integer months value", () => {
    expect(parseAwardDurationExtraction(JSON.stringify({ months: 47.6 })).months).toBe(48);
  });
});
