import { describe, expect, it } from "vitest";
import { mapProcedureType, regionLabel } from "@/lib/ted";
import { tenderStatus } from "@/lib/tenderStatus";

describe("mapProcedureType", () => {
  it("maps a known eForms procedure-type code to its official English label", () => {
    expect(mapProcedureType("open")).toBe("Open procedure");
    expect(mapProcedureType("restricted")).toBe("Restricted procedure");
    expect(mapProcedureType("neg-w-call")).toBe("Negotiated with prior call for competition");
  });

  it("falls back to the raw code for an unmapped value rather than guessing", () => {
    expect(mapProcedureType("some-future-code")).toBe("some-future-code");
  });

  it("returns null for a null code", () => {
    expect(mapProcedureType(null)).toBeNull();
  });
});

describe("regionLabel", () => {
  it("prefers the named Belgian province from a NUTS3 subdivision code", () => {
    expect(regionLabel({ country: "BEL", subdiv: "BE224", city: null })).toBe("Limburg");
  });

  it("falls back to city when no subdivision is present", () => {
    expect(regionLabel({ country: "BEL", subdiv: null, city: "Ghent" })).toBe("Ghent");
  });

  it("falls back to 'Belgium' when only the country is known", () => {
    expect(regionLabel({ country: "BEL", subdiv: null, city: null })).toBe("Belgium");
  });

  it("returns null when nothing was captured", () => {
    expect(regionLabel({ country: null, subdiv: null, city: null })).toBeNull();
  });

  it("returns the raw country code for a non-Belgian, unmapped subdivision", () => {
    expect(regionLabel({ country: "FRA", subdiv: "FR101", city: null })).toBe("FRA");
  });
});

describe("tenderStatus", () => {
  const now = new Date("2026-08-16T00:00:00Z");

  it("is open when the deadline is in the future", () => {
    expect(tenderStatus("2026-09-01", now)).toBe("open");
  });

  it("is deadlinePassed when the deadline is in the past", () => {
    expect(tenderStatus("2026-01-01", now)).toBe("deadlinePassed");
  });

  it("is unknown when there is no deadline", () => {
    expect(tenderStatus(null, now)).toBe("unknown");
  });

  it("is unknown for an unparseable deadline rather than throwing", () => {
    expect(tenderStatus("not-a-date", now)).toBe("unknown");
  });
});
