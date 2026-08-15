import { describe, expect, it } from "vitest";
import { chunkFieldsByCharBudget, parseTranslatedFields } from "@/lib/ai/anthropic-provider";
import { extractTranslatableTenderFields } from "@/lib/tenders/translation";

describe("chunkFieldsByCharBudget", () => {
  it("keeps small field sets in a single chunk", () => {
    const fields = { a: "short", b: "also short" };
    const chunks = chunkFieldsByCharBudget(fields, 4000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(fields);
  });

  it("splits once the combined character budget is exceeded", () => {
    const fields = { a: "x".repeat(30), b: "y".repeat(30), c: "z".repeat(30) };
    const chunks = chunkFieldsByCharBudget(fields, 50);
    expect(chunks.length).toBeGreaterThan(1);
    // every field appears exactly once across all chunks
    const merged = Object.assign({}, ...chunks);
    expect(merged).toEqual(fields);
  });

  it("never splits a single field across chunks, even if it alone exceeds the budget", () => {
    const fields = { huge: "x".repeat(10000), small: "y" };
    const chunks = chunkFieldsByCharBudget(fields, 100);
    const merged = Object.assign({}, ...chunks);
    expect(merged).toEqual(fields);
    expect(chunks.some((c) => c.huge === fields.huge)).toBe(true);
  });

  it("returns an empty array for an empty field set", () => {
    expect(chunkFieldsByCharBudget({}, 4000)).toEqual([]);
  });
});

describe("parseTranslatedFields", () => {
  const original = { summary: "Hello", "risks.0": "Some risk" };

  it("returns the model's translation for every original key", () => {
    const raw = JSON.stringify({ summary: "Bonjour", "risks.0": "Un risque" });
    const result = parseTranslatedFields(raw, original);
    expect(result).toEqual({ summary: "Bonjour", "risks.0": "Un risque" });
  });

  it("falls back to the source text for a key the model dropped", () => {
    const raw = JSON.stringify({ summary: "Bonjour" });
    const result = parseTranslatedFields(raw, original);
    expect(result["risks.0"]).toBe("Some risk");
  });

  it("never invents a key that wasn't in the original set", () => {
    const raw = JSON.stringify({ summary: "Bonjour", "risks.0": "Un risque", extra: "Made up" });
    const result = parseTranslatedFields(raw, original);
    expect(Object.keys(result).sort()).toEqual(["risks.0", "summary"]);
  });

  it("falls back to source text when a value isn't a string", () => {
    const raw = JSON.stringify({ summary: 123, "risks.0": null });
    const result = parseTranslatedFields(raw, original);
    expect(result).toEqual(original);
  });

  it("falls back to the original set entirely on unparseable JSON", () => {
    const result = parseTranslatedFields("not json at all", original);
    expect(result).toEqual(original);
  });

  it("salvages complete key/value pairs from JSON truncated mid-response (max_tokens cutoff)", () => {
    // Simulates the model hitting its output cap partway through the next
    // string value — the object never closes, so strict JSON.parse fails,
    // but "summary" completed cleanly before the cutoff.
    const truncated = '{"summary": "Bonjour", "risks.0": "Un risque incompl';
    const result = parseTranslatedFields(truncated, original);
    expect(result.summary).toBe("Bonjour");
    expect(result["risks.0"]).toBe("Some risk");
  });
});

describe("extractTranslatableTenderFields", () => {
  it("flattens summary, extras arrays, dimensions, disqualifiers, requirements, and award criteria", () => {
    const fields = extractTranslatableTenderFields({
      aiSummary: "A summary",
      aiAnalysis: { risks: ["Risk A"], ambiguities: [] },
      scoreDimensions: [
        { key: "capability_fit", label: "Capability fit", score: 80, explanation: "Good fit", unavailableReason: null },
      ],
      disqualifyingFactors: [
        {
          severity: "HIGH",
          requirement: "ISO 9001",
          companyStatus: "Not on file",
          evidence: null,
          explanation: "Missing certification",
          possibleMitigation: null,
        },
      ],
      requirements: [{ id: "req-1", title: "Provide references", description: "At least 3" }],
      awardCriteria: [{ id: "ac-1", criterion: "Price", description: null }],
      evidenceNotes: [{ requirementId: "req-1", notes: "Partially covered" }],
    });

    expect(fields["summary"]).toBe("A summary");
    expect(fields["risks.0"]).toBe("Risk A");
    expect(fields["dimensions.0.label"]).toBe("Capability fit");
    expect(fields["dimensions.0.explanation"]).toBe("Good fit");
    expect(fields["disqualifiers.0.requirement"]).toBe("ISO 9001");
    expect(fields["disqualifiers.0.companyStatus"]).toBe("Not on file");
    expect(fields["requirements.req-1.title"]).toBe("Provide references");
    expect(fields["requirements.req-1.description"]).toBe("At least 3");
    expect(fields["awardCriteria.ac-1.criterion"]).toBe("Price");
    expect(fields["awardCriteria.ac-1.description"]).toBeUndefined();
    expect(fields["evidenceNotes.req-1"]).toBe("Partially covered");
  });

  it("omits empty/null fields rather than emitting empty strings", () => {
    const fields = extractTranslatableTenderFields({
      aiSummary: null,
      aiAnalysis: null,
      scoreDimensions: [],
      disqualifyingFactors: [],
      requirements: [{ id: "req-1", title: "Title only", description: null }],
      awardCriteria: [],
      evidenceNotes: [{ requirementId: "req-1", notes: "" }],
    });

    expect(fields["summary"]).toBeUndefined();
    expect(fields["requirements.req-1.description"]).toBeUndefined();
    expect(fields["evidenceNotes.req-1"]).toBeUndefined();
    expect(fields["requirements.req-1.title"]).toBe("Title only");
  });
});
