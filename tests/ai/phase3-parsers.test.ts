import { describe, expect, it } from "vitest";
import { parseComplianceReview } from "@/lib/ai/anthropic-provider";

describe("parseComplianceReview", () => {
  it("parses flagged inconsistencies", () => {
    const raw = JSON.stringify({
      inconsistencies: [
        "Response to 'Personnel' says 5 staff, response to 'Technical' says 8 staff.",
      ],
    });
    expect(parseComplianceReview(raw).inconsistencies).toEqual([
      "Response to 'Personnel' says 5 staff, response to 'Technical' says 8 staff.",
    ]);
  });

  it("defaults to an empty array when nothing is flagged or the field is missing", () => {
    expect(parseComplianceReview(JSON.stringify({})).inconsistencies).toEqual([]);
    expect(parseComplianceReview(JSON.stringify({ inconsistencies: [] })).inconsistencies).toEqual([]);
  });

  it("never invents an issue when the model returns non-string entries", () => {
    const raw = JSON.stringify({ inconsistencies: ["real contradiction", 42, null] });
    expect(parseComplianceReview(raw).inconsistencies).toEqual(["real contradiction"]);
  });

  it("strips markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify({ inconsistencies: ["x"] }) + "\n```";
    expect(parseComplianceReview(raw).inconsistencies).toEqual(["x"]);
  });

  it("recovers from prose wrapped around the JSON object", () => {
    const raw = `Here is the review:\n${JSON.stringify({ inconsistencies: ["mismatch found"] })}\nEnd.`;
    expect(parseComplianceReview(raw).inconsistencies).toEqual(["mismatch found"]);
  });
});
