import { describe, expect, it } from "vitest";
import {
  mapTedNoticeToContractAward,
  parseAwardValue,
  resolveIngestionSinceDate,
} from "@/lib/ted";

describe("parseAwardValue", () => {
  it("parses a well-formed numeric award value and currency", () => {
    const result = parseAwardValue({
      "result-value-lot": { eng: "125000" },
      "result-value-cur-lot": { eng: "EUR" },
    });
    expect(result).toEqual({ numeric: 125000, currency: "EUR", hasNumeric: true });
  });

  it("defaults currency to EUR when absent", () => {
    const result = parseAwardValue({ "result-value-lot": { eng: "5000" } });
    expect(result.hasNumeric).toBe(true);
    expect(result.currency).toBe("EUR");
  });

  it("reports hasNumeric false when the value field is absent", () => {
    const result = parseAwardValue({});
    expect(result).toEqual({ numeric: null, currency: "EUR", hasNumeric: false });
  });

  it("reports hasNumeric false for a zero or non-numeric value", () => {
    expect(parseAwardValue({ "result-value-lot": { eng: "0" } }).hasNumeric).toBe(false);
    expect(parseAwardValue({ "result-value-lot": { eng: "not-a-number" } }).hasNumeric).toBe(false);
  });
});

describe("mapTedNoticeToContractAward", () => {
  it("maps a well-formed award notice to a contract_awards row", () => {
    const record = mapTedNoticeToContractAward({
      "publication-number": "769741-2025",
      "notice-title": { eng: "Belgium – Refuse-collection vehicles – 5 afvalophaalwagens MTM 3.5ton" },
      "buyer-name": { eng: "IVAGO" },
      "winner-name": { eng: "Acme Trucks NV" },
      "winner-country": { eng: "BE" },
      "result-value-lot": { eng: "150000" },
      "result-value-cur-lot": { eng: "EUR" },
      "publication-date": { eng: "2024-12-19" },
      "classification-cpv": ["34144511"],
    });

    expect(record).toEqual({
      sourceReference: "769741-2025",
      contractingAuthority: "IVAGO",
      cpvCodes: ["34144511"],
      awardDate: "2024-12-19",
      winnerName: "Acme Trucks NV",
      winnerCountry: "BE",
      awardValue: 150000,
      awardValueCurrency: "EUR",
      sourceUrl: "https://ted.europa.eu/en/notice/-/detail/769741-2025",
      rawTitle: "5 afvalophaalwagens MTM 3.5ton",
    });
  });

  it("falls back to sensible defaults for missing optional fields, never fabricating a winner", () => {
    const record = mapTedNoticeToContractAward({
      "publication-number": "999-2025",
    });

    expect(record.contractingAuthority).toBe("Unknown buyer");
    expect(record.winnerName).toBeNull();
    expect(record.winnerCountry).toBeNull();
    expect(record.awardValue).toBeNull();
    expect(record.awardValueCurrency).toBeNull();
    expect(record.awardDate).toBeNull();
    expect(record.cpvCodes).toEqual([]);
  });
});

describe("resolveIngestionSinceDate", () => {
  it("resumes from the latest stored award date when present", () => {
    expect(resolveIngestionSinceDate("2025-06-01", 12)).toBe("2025-06-01");
  });

  it("falls back to the configured backfill window when nothing is stored yet", () => {
    const result = resolveIngestionSinceDate(null, 12);
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 12);
    expect(result).toBe(expected.toISOString().slice(0, 10));
  });
});
