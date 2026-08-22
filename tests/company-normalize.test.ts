import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "@/lib/companies/normalize";

describe("normalizeCompanyName", () => {
  it("lowercases and trims", () => {
    expect(normalizeCompanyName("  Acme Trucks  ")).toBe("acme trucks");
  });

  it("strips a trailing Belgian legal-form suffix", () => {
    expect(normalizeCompanyName("Acme Trucks SA")).toBe("acme trucks");
    expect(normalizeCompanyName("Acme Trucks NV")).toBe("acme trucks");
    expect(normalizeCompanyName("Acme Trucks BV")).toBe("acme trucks");
    expect(normalizeCompanyName("Acme Trucks SRL")).toBe("acme trucks");
    expect(normalizeCompanyName("Acme Trucks BVBA")).toBe("acme trucks");
  });

  it("collapses dotted abbreviations before stripping the suffix", () => {
    expect(normalizeCompanyName("Acme Trucks S.A.")).toBe("acme trucks");
    expect(normalizeCompanyName("Acme Trucks N.V.")).toBe("acme trucks");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeCompanyName("Acme   Trucks   NV")).toBe("acme trucks");
  });

  it("strips other punctuation", () => {
    expect(normalizeCompanyName("Acme Trucks & Co.")).toBe("acme trucks");
    expect(normalizeCompanyName("Acme, Trucks' NV")).toBe("acme trucks");
  });

  it("treats casing differences as the same company", () => {
    expect(normalizeCompanyName("ACME TRUCKS NV")).toBe(normalizeCompanyName("acme trucks nv"));
  });

  it("does not strip a legal-form-like word that isn't trailing", () => {
    expect(normalizeCompanyName("NV Belgium Holdings")).toBe("nv belgium holdings");
  });

  it("returns an empty string for null, undefined, or blank input", () => {
    expect(normalizeCompanyName(null)).toBe("");
    expect(normalizeCompanyName(undefined)).toBe("");
    expect(normalizeCompanyName("   ")).toBe("");
    expect(normalizeCompanyName("")).toBe("");
  });

  it("never returns an empty string just because the whole name is a legal suffix", () => {
    // Loop only strips while more than one token remains, so a
    // single-token name is never stripped down to nothing.
    expect(normalizeCompanyName("NV")).toBe("nv");
  });
});
