import { describe, expect, it } from "vitest";
import { matchFollowedCompanies } from "@/lib/companies/followMatch";
import { normalizeCompanyName } from "@/lib/companies/normalize";

describe("matchFollowedCompanies", () => {
  it("matches an award to a user following the normalized winner name", () => {
    const matches = matchFollowedCompanies(
      [{ id: "award-1", winnerName: "Acme Trucks NV" }],
      [{ userId: "user-1", followedCompanyName: normalizeCompanyName("Acme Trucks NV") }]
    );

    expect(matches).toEqual([
      { userId: "user-1", followedCompanyName: "acme trucks", contractAwardId: "award-1" },
    ]);
  });

  it("matches despite legal-suffix/casing/whitespace differences", () => {
    const matches = matchFollowedCompanies(
      [{ id: "award-1", winnerName: "ACME TRUCKS N.V." }],
      [{ userId: "user-1", followedCompanyName: normalizeCompanyName("acme   trucks   nv") }]
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].contractAwardId).toBe("award-1");
  });

  it("produces one match per follower when multiple users follow the same company", () => {
    const normalized = normalizeCompanyName("Acme Trucks NV");
    const matches = matchFollowedCompanies(
      [{ id: "award-1", winnerName: "Acme Trucks NV" }],
      [
        { userId: "user-1", followedCompanyName: normalized },
        { userId: "user-2", followedCompanyName: normalized },
      ]
    );

    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.userId).sort()).toEqual(["user-1", "user-2"]);
  });

  it("produces one match per followed award when a user's award batch has several winners they follow", () => {
    const matches = matchFollowedCompanies(
      [
        { id: "award-1", winnerName: "Acme Trucks NV" },
        { id: "award-2", winnerName: "Acme Trucks NV" },
      ],
      [{ userId: "user-1", followedCompanyName: normalizeCompanyName("Acme Trucks NV") }]
    );

    expect(matches.map((m) => m.contractAwardId).sort()).toEqual(["award-1", "award-2"]);
  });

  it("does not match a different company", () => {
    const matches = matchFollowedCompanies(
      [{ id: "award-1", winnerName: "Beta Consulting SA" }],
      [{ userId: "user-1", followedCompanyName: normalizeCompanyName("Acme Trucks NV") }]
    );

    expect(matches).toEqual([]);
  });

  it("ignores awards with no winner name", () => {
    const matches = matchFollowedCompanies(
      [{ id: "award-1", winnerName: null }],
      [{ userId: "user-1", followedCompanyName: normalizeCompanyName("Acme Trucks NV") }]
    );

    expect(matches).toEqual([]);
  });

  it("returns no matches when nobody follows any companies", () => {
    const matches = matchFollowedCompanies([{ id: "award-1", winnerName: "Acme Trucks NV" }], []);
    expect(matches).toEqual([]);
  });

  it("returns no matches when there are no awards to check", () => {
    const matches = matchFollowedCompanies(
      [],
      [{ userId: "user-1", followedCompanyName: normalizeCompanyName("Acme Trucks NV") }]
    );
    expect(matches).toEqual([]);
  });
});
