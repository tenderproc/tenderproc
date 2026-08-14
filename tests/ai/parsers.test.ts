import { describe, expect, it } from "vitest";
import { parseBidRecommendation, parseTenderAnalysis } from "@/lib/ai/anthropic-provider";

describe("parseTenderAnalysis", () => {
  it("parses a well-formed response", () => {
    const raw = JSON.stringify({
      summary: "A cleaning contract for municipal offices.",
      contract: {
        title: "Office Cleaning Services",
        contractingAuthority: "City of Antwerp",
        referenceNumber: "REF-123",
        location: "Antwerp",
        estimatedValue: 420000,
        currency: "EUR",
        publicationDate: "2026-01-01",
        submissionDeadline: "2026-09-18",
        contractDuration: "4 years",
      },
      awardCriteria: [{ criterion: "Price", weight: "40%", description: null }],
      requirements: [
        {
          title: "ISO 9001 certification",
          description: "Bidder must hold ISO 9001.",
          category: "certification",
          mandatory: true,
          sourcePage: 3,
          sourceSection: "Section 2.1",
        },
      ],
      requiredDocuments: ["ESPD"],
      risks: ["Tight deadline"],
      ambiguities: ["Cleaning frequency for Building B is unclear"],
    });

    const result = parseTenderAnalysis(raw);

    expect(result.summary).toBe("A cleaning contract for municipal offices.");
    expect(result.contract.title).toBe("Office Cleaning Services");
    expect(result.contract.estimatedValue).toBe(420000);
    expect(result.awardCriteria).toHaveLength(1);
    expect(result.awardCriteria[0].criterion).toBe("Price");
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].category).toBe("certification");
    expect(result.requirements[0].mandatory).toBe(true);
    expect(result.requiredDocuments).toEqual(["ESPD"]);
    expect(result.ambiguities).toEqual(["Cleaning frequency for Building B is unclear"]);
  });

  it("strips markdown code fences before parsing", () => {
    const raw = "```json\n" + JSON.stringify({ summary: "ok" }) + "\n```";
    expect(parseTenderAnalysis(raw).summary).toBe("ok");
  });

  it("defaults missing/invalid fields instead of throwing", () => {
    const result = parseTenderAnalysis(JSON.stringify({}));

    expect(result.summary).toBe("");
    expect(result.contract.title).toBeNull();
    expect(result.contract.estimatedValue).toBeNull();
    expect(result.awardCriteria).toEqual([]);
    expect(result.requirements).toEqual([]);
    expect(result.requiredDocuments).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.ambiguities).toEqual([]);
  });

  it("falls back an unrecognized requirement category to 'other' rather than dropping it", () => {
    const raw = JSON.stringify({
      requirements: [{ title: "Some requirement", category: "not-a-real-category" }],
    });
    const result = parseTenderAnalysis(raw);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].category).toBe("other");
  });

  it("treats mandatory as true unless explicitly false", () => {
    const raw = JSON.stringify({
      requirements: [
        { title: "A", category: "technical" },
        { title: "B", category: "technical", mandatory: false },
      ],
    });
    const result = parseTenderAnalysis(raw);
    expect(result.requirements[0].mandatory).toBe(true);
    expect(result.requirements[1].mandatory).toBe(false);
  });

  it("drops requirement/award-criterion entries missing their required title/criterion", () => {
    const raw = JSON.stringify({
      requirements: [{ description: "no title here" }],
      awardCriteria: [{ weight: "10%" }],
    });
    const result = parseTenderAnalysis(raw);
    expect(result.requirements).toEqual([]);
    expect(result.awardCriteria).toEqual([]);
  });
});

describe("parseBidRecommendation", () => {
  it("parses a well-formed response", () => {
    const raw = JSON.stringify({
      score: 87,
      matchLabel: "Strong match",
      recommendation: "BID",
      confidence: "HIGH",
      positiveFactors: ["Comparable reference found: Municipality A"],
      risks: ["Third reference missing"],
      missingRequirements: ["ISO 14001"],
      estimatedEffortHours: { min: 25, max: 35 },
    });

    const result = parseBidRecommendation(raw);

    expect(result.score).toBe(87);
    expect(result.matchLabel).toBe("Strong match");
    expect(result.recommendation).toBe("BID");
    expect(result.confidence).toBe("HIGH");
    expect(result.positiveFactors).toEqual(["Comparable reference found: Municipality A"]);
    expect(result.estimatedEffortHours).toEqual({ min: 25, max: 35 });
  });

  it("clamps out-of-range scores into 0-100", () => {
    expect(parseBidRecommendation(JSON.stringify({ score: 150 })).score).toBe(100);
    expect(parseBidRecommendation(JSON.stringify({ score: -20 })).score).toBe(0);
  });

  it("derives a match label from the score when the given label is invalid", () => {
    expect(parseBidRecommendation(JSON.stringify({ score: 90, matchLabel: "Great!" })).matchLabel).toBe(
      "Strong match"
    );
    expect(parseBidRecommendation(JSON.stringify({ score: 10 })).matchLabel).toBe("Weak match");
  });

  it("falls back recommendation/confidence to safe defaults when invalid or missing", () => {
    const result = parseBidRecommendation(JSON.stringify({ score: 50 }));
    expect(result.recommendation).toBe("CONSIDER");
    expect(result.confidence).toBe("LOW");
  });

  it("treats an incomplete effort estimate as null rather than partial", () => {
    const result = parseBidRecommendation(JSON.stringify({ score: 50, estimatedEffortHours: { min: 10 } }));
    expect(result.estimatedEffortHours).toBeNull();
  });

  it("never invents positive factors when none are given", () => {
    const result = parseBidRecommendation(JSON.stringify({ score: 20 }));
    expect(result.positiveFactors).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.missingRequirements).toEqual([]);
  });
});
