import { beforeEach, describe, expect, it, vi } from "vitest";

const BASE_URL = "https://bosa.example.com";

beforeEach(() => {
  process.env.BOSA_BASE_URL = BASE_URL;
  delete process.env.BOSA_CLIENT_ID;
  delete process.env.BOSA_CLIENT_SECRET;
  delete process.env.BOSA_AUTH_REALM;
  vi.unstubAllGlobals();
  vi.resetModules();
});

// Real UBL/eForms wire format, confirmed live against BOSA notices:
// unprefixed root, cac:/cbc:-prefixed common components.
const SINGLE_LANG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ContractNotice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cac:TenderingProcess>
    <cbc:ProcedureCode listName="procurement-procedure-type">open</cbc:ProcedureCode>
  </cac:TenderingProcess>
  <cac:ProcurementProject>
    <cbc:Name languageID="NLD">Aankoop van boeken</cbc:Name>
    <cbc:Description languageID="NLD">Aankoop van boeken voor de bibliotheek</cbc:Description>
    <cac:MainCommodityClassification>
      <cbc:ItemClassificationCode listName="cpv">22100000</cbc:ItemClassificationCode>
    </cac:MainCommodityClassification>
    <cac:RealizedLocation>
      <cac:Address>
        <cbc:CountrySubentityCode listName="nuts">BE213</cbc:CountrySubentityCode>
      </cac:Address>
    </cac:RealizedLocation>
  </cac:ProcurementProject>
  <cac:ProcurementProjectLot>
    <cac:TenderingProcess>
      <cac:TenderSubmissionDeadlinePeriod>
        <cbc:EndDate>2026-10-08+02:00</cbc:EndDate>
        <cbc:EndTime>12:00:00+02:00</cbc:EndTime>
      </cac:TenderSubmissionDeadlinePeriod>
    </cac:TenderingProcess>
    <cac:ProcurementProject>
      <cbc:Description languageID="NLD">Lot-level description, should be ignored</cbc:Description>
    </cac:ProcurementProject>
  </cac:ProcurementProjectLot>
</ContractNotice>`;

const MULTI_LANG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ContractAwardNotice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cac:ProcurementProject>
    <cbc:Description languageID="FRA">L'achat de moteurs</cbc:Description>
    <cbc:Description languageID="NLD">De aankoop van motoren</cbc:Description>
    <cbc:Description languageID="ENG">The purchase of motors</cbc:Description>
  </cac:ProcurementProject>
</ContractAwardNotice>`;

const VALUE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ContractNotice xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:EstimatedOverallContractAmount currencyID="EUR">125000</cbc:EstimatedOverallContractAmount>
</ContractNotice>`;

describe("extractDescription", () => {
  it("extracts the root-level ProcurementProject/Description, ignoring lot-level ones", async () => {
    const { extractDescription } = await import("@/lib/bosa");
    expect(extractDescription(SINGLE_LANG_XML)).toBe("Aankoop van boeken voor de bibliotheek");
  });

  it("picks by language priority NL > FR > EN > DE across multiple Description elements", async () => {
    const { extractDescription } = await import("@/lib/bosa");
    expect(extractDescription(MULTI_LANG_XML)).toBe("De aankoop van motoren");
  });

  it("returns null for absent XML", async () => {
    const { extractDescription } = await import("@/lib/bosa");
    expect(extractDescription(null)).toBeNull();
  });

  it("returns null for malformed XML rather than throwing", async () => {
    const { extractDescription } = await import("@/lib/bosa");
    expect(extractDescription("<not valid <<xml")).toBeNull();
  });
});

describe("extractEstimatedValue", () => {
  it("extracts amount and currency when present", async () => {
    const { extractEstimatedValue } = await import("@/lib/bosa");
    expect(extractEstimatedValue(VALUE_XML)).toEqual({ amount: 125000, currency: "EUR" });
  });

  it("returns null when the tag is absent (most notices)", async () => {
    const { extractEstimatedValue } = await import("@/lib/bosa");
    expect(extractEstimatedValue(SINGLE_LANG_XML)).toBeNull();
  });
});

describe("extractNoticeMetadata", () => {
  it("extracts title, CPV, procedure type, region from the root-level ProcurementProject/TenderingProcess", async () => {
    const { extractNoticeMetadata } = await import("@/lib/bosa");
    const meta = extractNoticeMetadata(SINGLE_LANG_XML);
    expect(meta.title).toBe("Aankoop van boeken");
    expect(meta.cpvCode).toBe("22100000");
    expect(meta.procedureType).toBe("open");
    expect(meta.region).toBe("BE213");
  });

  it("extracts the first lot's submission deadline as a combined ISO datetime", async () => {
    const { extractNoticeMetadata } = await import("@/lib/bosa");
    expect(extractNoticeMetadata(SINGLE_LANG_XML).deadline).toBe("2026-10-08T12:00:00+02:00");
  });

  it("leaves deadline null for a notice with no lot submission period (e.g. an award notice)", async () => {
    const { extractNoticeMetadata } = await import("@/lib/bosa");
    expect(extractNoticeMetadata(MULTI_LANG_XML).deadline).toBeNull();
  });

  it("returns all-null for absent XML rather than throwing", async () => {
    const { extractNoticeMetadata } = await import("@/lib/bosa");
    expect(extractNoticeMetadata(null)).toEqual({
      title: null,
      cpvCode: null,
      procedureType: null,
      deadline: null,
      region: null,
    });
  });
});

function stubEnvAndToken(handlers: { workspace: (url: string) => Response }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/env.config.js")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            "VITE_AUTH_CLIENTID: 'pub-client', VITE_AUTH_CLIENTSECRET: 'pub-secret', VITE_AUTH_REALM: 'supplier', VITE_AUTH_URL: ''",
        } as Response;
      }
      if (url.includes("/protocol/openid-connect/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "tok-1", expires_in: 300 }) } as Response;
      }
      if (url.includes("/publication-workspaces/")) {
        return handlers.workspace(url);
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
}

describe("getBosaTenderById", () => {
  it("discovers the client and fetches a workspace, mapping into TenderDetail", async () => {
    let workspaceCallCount = 0;
    stubEnvAndToken({
      workspace: (() => {
        workspaceCallCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            organisationNames: [{ language: "NL", text: "Test org" }],
            versions: [
              { activationDate: "2026-08-16", notice: { xmlContent: SINGLE_LANG_XML } },
            ],
          }),
        } as Response;
      }) as unknown as (url: string) => Response,
    });

    const { getBosaTenderById } = await import("@/lib/bosa");
    const tender = await getBosaTenderById("ws-1");

    expect(workspaceCallCount).toBe(1);
    expect(tender).toMatchObject({
      publicationNumber: "BOSA:ws-1",
      title: "Aankoop van boeken",
      buyerName: "Test org",
      sourceName: "BOSA e-Notification",
      description: "Aankoop van boeken voor de bibliotheek",
      procedureType: "open",
      region: "BE213",
      cpvCodes: ["22100000"],
      publicationDate: "2026-08-16",
      deadline: "2026-10-08T12:00:00+02:00",
    });
    expect(tender?.url).toBe(`${BASE_URL}/publication-workspaces/ws-1`);
    expect(tender?.documentUrls).toEqual([`${BASE_URL}/publication-workspaces/ws-1/documents`]);
  });

  it("returns null for a 404 (workspace not found)", async () => {
    stubEnvAndToken({
      workspace: () => ({ ok: false, status: 404 } as Response),
    });

    const { getBosaTenderById } = await import("@/lib/bosa");
    expect(await getBosaTenderById("missing")).toBeNull();
  });

  it("retries once with a forced token refresh on a 401", async () => {
    let workspaceAttempts = 0;
    let tokenFetches = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/env.config.js")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              "VITE_AUTH_CLIENTID: 'pub-client', VITE_AUTH_CLIENTSECRET: 'pub-secret', VITE_AUTH_REALM: 'supplier', VITE_AUTH_URL: ''",
          } as Response;
        }
        if (url.includes("/protocol/openid-connect/token")) {
          tokenFetches++;
          return { ok: true, status: 200, json: async () => ({ access_token: `tok-${tokenFetches}`, expires_in: 300 }) } as Response;
        }
        if (url.includes("/publication-workspaces/ws-1")) {
          workspaceAttempts++;
          if (workspaceAttempts === 1) {
            return { ok: false, status: 401 } as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              organisationNames: [{ language: "NL", text: "Retried org" }],
              versions: [],
            }),
          } as Response;
        }
        throw new Error(`unexpected fetch: ${url}`);
      })
    );

    const { getBosaTenderById } = await import("@/lib/bosa");
    const tender = await getBosaTenderById("ws-1");

    expect(workspaceAttempts).toBe(2);
    expect(tokenFetches).toBe(2);
    expect(tender?.buyerName).toBe("Retried org");
    // No xmlContent in this response -> title/description absent, never a guess.
    expect(tender?.title).toBe("Untitled notice");
    expect(tender?.description).toBeNull();
  });
});
