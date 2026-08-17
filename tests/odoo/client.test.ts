import { beforeEach, describe, expect, it, vi } from "vitest";

const ODOO_URL = "https://odoo.example.com";

function mockJsonRpc(responses: unknown[]) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const result = responses[call++];
      return {
        ok: true,
        json: async () => ({ jsonrpc: "2.0", id: call, result }),
        text: async () => "",
      } as Response;
    })
  );
}

function rpcCallArgs(callIndex: number) {
  const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  return JSON.parse(calls[callIndex][1].body).params;
}

beforeEach(() => {
  process.env.ODOO_URL = ODOO_URL;
  process.env.ODOO_DB = "tenderproc";
  process.env.ODOO_USERNAME = "api@tenderproc.example";
  process.env.ODOO_API_KEY = "test-key";
  delete process.env.ODOO_MOR_TAX_ID;
  vi.unstubAllGlobals();
});

describe("createInvoice", () => {
  it("authenticates, reuses an existing partner by email, and creates an invoice with no Odoo-side tax by default", async () => {
    mockJsonRpc([
      42, // authenticate -> uid
      [{ id: 7 }], // search_read res.partner -> found existing
      501, // account.move create -> invoice id
    ]);
    const { createInvoice } = await import("@/lib/odoo/client");

    // €49.00 total / €8.50 tax, in Paddle's actual wire format: integer
    // minor units as strings, not decimals.
    const result = await createInvoice({
      partnerName: "Acme BVBA",
      partnerEmail: "billing@acme.example",
      amountTotal: "4900",
      amountTax: "850",
      currency: "EUR",
      description: "TenderProc Pro subscription",
      paddleTransactionId: "txn_1",
    });

    expect(result.odooInvoiceId).toBe(501);

    expect(rpcCallArgs(0)).toMatchObject({ service: "common", method: "authenticate" });

    const searchArgs = rpcCallArgs(1);
    expect(searchArgs.method).toBe("execute_kw");
    expect(searchArgs.args[3]).toBe("res.partner");
    expect(searchArgs.args[4]).toBe("search_read");
    expect(searchArgs.args[5]).toEqual([[["email", "=", "billing@acme.example"]]]);

    const invoiceArgs = rpcCallArgs(2);
    expect(invoiceArgs.args[3]).toBe("account.move");
    expect(invoiceArgs.args[4]).toBe("create");
    const invoicePayload = invoiceArgs.args[5][0];
    expect(invoicePayload.partner_id).toBe(7);
    // 4900 minor units -> 49.00 decimal, not left as 4900.
    expect(invoicePayload.invoice_line_ids[0][2].price_unit).toBe(49);
    expect(invoicePayload.invoice_line_ids[0][2].tax_ids).toEqual([[6, 0, []]]);
    expect(invoicePayload.invoice_line_ids[0][2].name).toContain("txn_1");
    expect(invoicePayload.invoice_line_ids[0][2].name).toContain("VAT");
    expect(invoicePayload.invoice_line_ids[0][2].name).toContain("8.50");
  });

  it("creates a new partner when no existing one matches the email", async () => {
    mockJsonRpc([42, [], 88, 502]);
    const { createInvoice } = await import("@/lib/odoo/client");

    await createInvoice({
      partnerName: "New Customer",
      partnerEmail: "new@example.com",
      amountTotal: "7900",
      amountTax: "1371",
      currency: "EUR",
      description: "TenderProc Premium subscription",
      paddleTransactionId: "txn_2",
    });

    const createPartnerArgs = rpcCallArgs(2);
    expect(createPartnerArgs.args[3]).toBe("res.partner");
    expect(createPartnerArgs.args[4]).toBe("create");
    expect(createPartnerArgs.args[5][0]).toMatchObject({ name: "New Customer", email: "new@example.com" });

    const invoiceArgs = rpcCallArgs(3);
    expect(invoiceArgs.args[3]).toBe("account.move");
    const invoicePayload = invoiceArgs.args[5][0];
    expect(invoicePayload.partner_id).toBe(88);
    expect(invoicePayload.invoice_line_ids[0][2].price_unit).toBe(79);
  });

  it("uses ODOO_MOR_TAX_ID when set instead of leaving the line tax-free", async () => {
    process.env.ODOO_MOR_TAX_ID = "15";
    mockJsonRpc([42, [{ id: 7 }], 503]);
    const { createInvoice } = await import("@/lib/odoo/client");

    await createInvoice({
      partnerName: "Acme BVBA",
      partnerEmail: "billing@acme.example",
      amountTotal: "4900",
      amountTax: "850",
      currency: "EUR",
      description: "TenderProc Pro subscription",
      paddleTransactionId: "txn_3",
    });

    const invoicePayload = rpcCallArgs(2).args[5][0];
    expect(invoicePayload.invoice_line_ids[0][2].tax_ids).toEqual([[6, 0, [15]]]);
  });

  it("throws a clear error when Odoo env vars are missing rather than silently no-op-ing", async () => {
    delete process.env.ODOO_URL;
    const { createInvoice } = await import("@/lib/odoo/client");

    await expect(
      createInvoice({
        partnerName: "Acme",
        partnerEmail: "a@b.com",
        amountTotal: "100",
        amountTax: "0",
        currency: "EUR",
        description: "x",
        paddleTransactionId: "txn_x",
      })
    ).rejects.toThrow(/ODOO_URL/);
  });

  it("surfaces an Odoo JSON-RPC error response as a thrown error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ error: { message: "Access Denied", data: { message: "Invalid API key" } } }),
        text: async () => "",
      })) as unknown as typeof fetch
    );
    const { createInvoice } = await import("@/lib/odoo/client");

    await expect(
      createInvoice({
        partnerName: "Acme",
        partnerEmail: "a@b.com",
        amountTotal: "100",
        amountTax: "0",
        currency: "EUR",
        description: "x",
        paddleTransactionId: "txn_y",
      })
    ).rejects.toThrow(/Invalid API key/);
  });
});
