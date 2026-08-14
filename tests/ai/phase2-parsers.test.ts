import { describe, expect, it } from "vitest";
import {
  parseEvidenceMatches,
  parseResponseDraft,
  parseValidateResponse,
} from "@/lib/ai/anthropic-provider";

describe("parseEvidenceMatches", () => {
  const validIds = new Set(["svc-1", "cert-1", "ref-1"]);

  it("parses well-formed matches that reference real ids", () => {
    const raw = JSON.stringify([
      { type: "service", id: "svc-1", relevance: "High", reason: "Directly matches the requirement." },
      { type: "certification", id: "cert-1", relevance: "Medium", reason: "Partially relevant." },
    ]);
    const result = parseEvidenceMatches(raw, validIds);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "service", id: "svc-1", relevance: "High" });
  });

  it("drops any match whose id is not in the real company id set — never invents evidence", () => {
    const raw = JSON.stringify([
      { type: "reference", id: "ref-1", relevance: "High", reason: "Real." },
      { type: "reference", id: "ref-made-up", relevance: "High", reason: "Hallucinated." },
    ]);
    const result = parseEvidenceMatches(raw, validIds);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ref-1");
  });

  it("drops matches with an invalid type even if the id is real", () => {
    const raw = JSON.stringify([{ type: "document", id: "svc-1", relevance: "High", reason: "x" }]);
    expect(parseEvidenceMatches(raw, validIds)).toEqual([]);
  });

  it("falls back an invalid relevance to Low rather than dropping the match", () => {
    const raw = JSON.stringify([{ type: "service", id: "svc-1", relevance: "Extreme", reason: "x" }]);
    const result = parseEvidenceMatches(raw, validIds);
    expect(result[0].relevance).toBe("Low");
  });

  it("returns an empty array for a non-array response", () => {
    expect(parseEvidenceMatches(JSON.stringify({}), validIds)).toEqual([]);
  });

  it("labels are left blank for the caller to fill from the real row, never trusted from the model", () => {
    const raw = JSON.stringify([{ type: "service", id: "svc-1", relevance: "High", reason: "x" }]);
    expect(parseEvidenceMatches(raw, validIds)[0].label).toBe("");
  });
});

describe("parseResponseDraft", () => {
  it("parses a well-formed draft", () => {
    const raw = JSON.stringify({
      draft: "We have delivered daily cleaning services to Municipality A since 2022.",
      confidence: "HIGH",
      warnings: ["Does not address the staffing sub-requirement."],
    });
    const result = parseResponseDraft(raw);
    expect(result.draft).toContain("Municipality A");
    expect(result.confidence).toBe("HIGH");
    expect(result.warnings).toHaveLength(1);
  });

  it("defaults missing fields instead of throwing", () => {
    const result = parseResponseDraft(JSON.stringify({}));
    expect(result.draft).toBe("");
    expect(result.confidence).toBe("LOW");
    expect(result.warnings).toEqual([]);
  });

  it("strips markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify({ draft: "ok", confidence: "MEDIUM" }) + "\n```";
    expect(parseResponseDraft(raw).draft).toBe("ok");
  });
});

describe("parseValidateResponse", () => {
  it("parses flagged unsupported claims", () => {
    const raw = JSON.stringify({ unsupportedClaims: ["we have completed over 50 similar projects"] });
    expect(parseValidateResponse(raw).unsupportedClaims).toEqual([
      "we have completed over 50 similar projects",
    ]);
  });

  it("defaults to an empty array when nothing is flagged or the field is missing", () => {
    expect(parseValidateResponse(JSON.stringify({})).unsupportedClaims).toEqual([]);
    expect(parseValidateResponse(JSON.stringify({ unsupportedClaims: [] })).unsupportedClaims).toEqual([]);
  });

  it("never invents an issue when the model returns non-string entries", () => {
    const raw = JSON.stringify({ unsupportedClaims: ["real claim", 42, null] });
    expect(parseValidateResponse(raw).unsupportedClaims).toEqual(["real claim"]);
  });
});
