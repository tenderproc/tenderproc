import { describe, expect, it } from "vitest";
import {
  parseBidRecommendation,
  parseRequirementEvidenceMapping,
} from "@/lib/ai/anthropic-provider";
import { SCORE_DIMENSION_KEYS } from "@/lib/ai/types";

function fullDimensions(overrides: Record<string, unknown> = {}) {
  return SCORE_DIMENSION_KEYS.map((key) => ({
    key,
    label: key,
    score: key === "competition" ? null : 70,
    explanation: "x",
    unavailableReason: key === "competition" ? "No data" : null,
    ...overrides,
  }));
}

describe("parseBidRecommendation — dimensions", () => {
  it("parses a full, well-formed set of dimensions in order", () => {
    const raw = JSON.stringify({
      score: 80,
      matchLabel: "Good match",
      recommendation: "BID",
      confidence: "HIGH",
      dimensions: fullDimensions(),
    });
    const result = parseBidRecommendation(raw);
    expect(result.dimensions).toHaveLength(SCORE_DIMENSION_KEYS.length);
    expect(result.dimensions.map((d) => d.key)).toEqual(SCORE_DIMENSION_KEYS);
  });

  it("fills in missing dimensions as unavailable rather than dropping them", () => {
    const raw = JSON.stringify({ score: 50, dimensions: [{ key: "capability_fit", score: 90 }] });
    const result = parseBidRecommendation(raw);
    expect(result.dimensions).toHaveLength(SCORE_DIMENSION_KEYS.length);
    const missing = result.dimensions.find((d) => d.key === "experience");
    expect(missing?.score).toBeNull();
    expect(missing?.unavailableReason).toBe("Not assessed.");
  });

  it("never trusts a model-provided competition score, even if one is given", () => {
    const raw = JSON.stringify({
      score: 50,
      dimensions: [{ key: "competition", score: 99, explanation: "guessed" }],
    });
    const result = parseBidRecommendation(raw);
    const competition = result.dimensions.find((d) => d.key === "competition");
    expect(competition?.score).toBeNull();
    expect(competition?.unavailableReason).toBeTruthy();
  });

  it("drops dimension entries with an unrecognized key", () => {
    const raw = JSON.stringify({ score: 50, dimensions: [{ key: "made_up_dimension", score: 10 }] });
    const result = parseBidRecommendation(raw);
    expect(result.dimensions.map((d) => d.key)).toEqual(SCORE_DIMENSION_KEYS);
  });

  it("clamps out-of-range dimension scores", () => {
    const raw = JSON.stringify({ score: 50, dimensions: [{ key: "capability_fit", score: 150 }] });
    const result = parseBidRecommendation(raw);
    expect(result.dimensions.find((d) => d.key === "capability_fit")?.score).toBe(100);
  });

  it("defaults to an empty dimensions/disqualifiers-free shape when absent entirely", () => {
    const result = parseBidRecommendation(JSON.stringify({ score: 50 }));
    expect(result.dimensions).toHaveLength(SCORE_DIMENSION_KEYS.length);
    expect(result.dimensions.every((d) => d.score === null)).toBe(true);
    expect(result.disqualifyingFactors).toEqual([]);
  });
});

describe("parseBidRecommendation — disqualifyingFactors", () => {
  it("parses well-formed disqualifiers", () => {
    const raw = JSON.stringify({
      score: 40,
      disqualifyingFactors: [
        {
          severity: "CRITICAL",
          requirement: "Minimum turnover EUR 5M",
          companyStatus: "Turnover on file: EUR 2.8M",
          evidence: "company profile",
          explanation: "Below the stated minimum.",
          possibleMitigation: null,
        },
      ],
    });
    const result = parseBidRecommendation(raw);
    expect(result.disqualifyingFactors).toHaveLength(1);
    expect(result.disqualifyingFactors[0].severity).toBe("CRITICAL");
  });

  it("drops entries without a requirement", () => {
    const raw = JSON.stringify({ score: 40, disqualifyingFactors: [{ severity: "HIGH" }] });
    expect(parseBidRecommendation(raw).disqualifyingFactors).toEqual([]);
  });

  it("defaults an invalid severity to MEDIUM rather than dropping the entry", () => {
    const raw = JSON.stringify({
      score: 40,
      disqualifyingFactors: [{ severity: "EXTREME", requirement: "x" }],
    });
    expect(parseBidRecommendation(raw).disqualifyingFactors[0].severity).toBe("MEDIUM");
  });
});

describe("parseRequirementEvidenceMapping", () => {
  const validEvidenceIds = new Set(["svc-1", "cert-1"]);
  const validRequirementIds = new Set(["req-1", "req-2"]);

  it("parses well-formed mappings referencing real requirement and evidence ids", () => {
    const raw = JSON.stringify({
      mappings: [
        {
          requirementId: "req-1",
          status: "VERIFIED",
          confidence: "HIGH",
          notes: "Covered.",
          evidence: [{ type: "service", id: "svc-1", label: "Cleaning" }],
        },
      ],
    });
    const result = parseRequirementEvidenceMapping(raw, validEvidenceIds, validRequirementIds);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0].evidence).toHaveLength(1);
  });

  it("drops the whole mapping when requirementId isn't one of the real ids given", () => {
    const raw = JSON.stringify({
      mappings: [{ requirementId: "req-made-up", status: "VERIFIED", evidence: [] }],
    });
    const result = parseRequirementEvidenceMapping(raw, validEvidenceIds, validRequirementIds);
    expect(result.mappings).toEqual([]);
  });

  it("drops hallucinated evidence ids but keeps the mapping itself", () => {
    const raw = JSON.stringify({
      mappings: [
        {
          requirementId: "req-2",
          status: "PARTIAL",
          evidence: [
            { type: "service", id: "svc-1", label: "Real" },
            { type: "service", id: "svc-made-up", label: "Hallucinated" },
          ],
        },
      ],
    });
    const result = parseRequirementEvidenceMapping(raw, validEvidenceIds, validRequirementIds);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0].evidence).toHaveLength(1);
    expect(result.mappings[0].evidence[0].id).toBe("svc-1");
  });

  it("defaults an invalid status to NEEDS_REVIEW", () => {
    const raw = JSON.stringify({
      mappings: [{ requirementId: "req-1", status: "SOMETHING_ELSE", evidence: [] }],
    });
    const result = parseRequirementEvidenceMapping(raw, validEvidenceIds, validRequirementIds);
    expect(result.mappings[0].status).toBe("NEEDS_REVIEW");
  });

  it("returns an empty array when the mappings field is missing", () => {
    const result = parseRequirementEvidenceMapping(JSON.stringify({}), validEvidenceIds, validRequirementIds);
    expect(result.mappings).toEqual([]);
  });
});
