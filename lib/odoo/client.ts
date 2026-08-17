/**
 * Minimal Odoo client, JSON-RPC (Odoo supports both XML-RPC and JSON-RPC —
 * JSON-RPC avoids pulling in an XML-RPC dependency and is trivially
 * testable with a mocked fetch). Scoped to exactly what billing needs:
 * find-or-create the customer, create the invoice. Nothing else.
 *
 * No live Odoo instance exists yet for this project (per project owner) —
 * this is a scaffold, unit-tested against mocked JSON-RPC responses. Wire
 * up real ODOO_* env vars (see .env.example) before relying on it.
 *
 * Amounts: Paddle reports transaction totals as strings of the integer
 * number of the currency's smallest unit (e.g. "4900" for €49.00, not
 * "49.00" — see transaction.details.totals in Paddle's webhook payloads).
 * `createInvoice` expects that raw format and converts it itself.
 *
 * VAT handling: Paddle, as Merchant of Record, already collects and remits
 * EU VAT on our behalf — Odoo must NOT calculate VAT again on top of what
 * Paddle already charged the customer. `createInvoice` records the
 * Paddle-collected amount as revenue with no Odoo-side tax applied by
 * default. If your Odoo setup has a specific fiscal position/tax id for
 * "VAT collected by a third-party MoR", set `ODOO_MOR_TAX_ID` — otherwise
 * this deliberately leaves the invoice line tax-free rather than guessing
 * a tax treatment. Confirm the right mapping with your accountant before
 * relying on this for real filings.
 */

interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

function getOdooConfig(): OdooConfig {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) {
    throw new Error(
      "Odoo is not configured — set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY (see .env.example)."
    );
  }
  return { url, db, username, apiKey };
}

let _requestId = 0;

async function jsonRpcCall<T>(
  config: OdooConfig,
  service: "common" | "object",
  method: string,
  args: unknown[]
): Promise<T> {
  const res = await fetch(`${config.url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: ++_requestId,
    }),
  });

  if (!res.ok) {
    throw new Error(`Odoo JSON-RPC HTTP ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  if (body.error) {
    const detail = body.error.data?.message ?? body.error.message ?? JSON.stringify(body.error);
    throw new Error(`Odoo JSON-RPC error: ${detail}`);
  }
  return body.result as T;
}

async function authenticate(config: OdooConfig): Promise<number> {
  const uid = await jsonRpcCall<number | false>(config, "common", "authenticate", [
    config.db,
    config.username,
    config.apiKey,
    {},
  ]);
  if (!uid) throw new Error("Odoo authentication failed — check ODOO_DB/ODOO_USERNAME/ODOO_API_KEY.");
  return uid;
}

async function executeKw<T>(
  config: OdooConfig,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  return jsonRpcCall<T>(config, "object", "execute_kw", [
    config.db,
    uid,
    config.apiKey,
    model,
    method,
    args,
    kwargs,
  ]);
}

async function findOrCreatePartner(
  config: OdooConfig,
  uid: number,
  params: { name: string; email: string }
): Promise<number> {
  const existing = await executeKw<[{ id: number }]>(
    config,
    uid,
    "res.partner",
    "search_read",
    [[["email", "=", params.email]]],
    { fields: ["id"], limit: 1 }
  );
  if (existing.length > 0) return existing[0].id;

  return executeKw<number>(config, uid, "res.partner", "create", [
    { name: params.name, email: params.email },
  ]);
}

export interface CreateInvoiceParams {
  partnerName: string;
  partnerEmail: string;
  /** VAT-inclusive amount the customer actually paid, as Paddle reports
   * it: a string of the INTEGER number of the smallest currency unit
   * (e.g. "4900" for €49.00 — cents, not a decimal). Converted to a
   * decimal amount inside this module; pass Paddle's raw value through
   * unchanged, don't pre-divide it yourself. */
  amountTotal: string;
  /** The VAT portion of amountTotal, same integer-minor-unit format,
   * informational only — not re-applied as an Odoo tax; see module docs
   * above. */
  amountTax: string;
  currency: string;
  description: string;
  paddleTransactionId: string;
}

function minorUnitsToDecimal(amount: string): number {
  return Number(amount) / 100;
}

export interface CreateInvoiceResult {
  odooInvoiceId: number;
}

export async function createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
  const config = getOdooConfig();
  const uid = await authenticate(config);
  const partnerId = await findOrCreatePartner(config, uid, {
    name: params.partnerName,
    email: params.partnerEmail,
  });

  const taxId = process.env.ODOO_MOR_TAX_ID ? Number(process.env.ODOO_MOR_TAX_ID) : null;
  const totalDecimal = minorUnitsToDecimal(params.amountTotal);
  const taxDecimal = minorUnitsToDecimal(params.amountTax);
  const lineNote =
    `TenderProc subscription — Paddle transaction ${params.paddleTransactionId}. ` +
    `VAT (${taxDecimal.toFixed(2)} ${params.currency}) already collected and remitted by Paddle as Merchant of Record.`;

  const invoiceId = await executeKw<number>(config, uid, "account.move", "create", [
    {
      move_type: "out_invoice",
      partner_id: partnerId,
      ref: params.paddleTransactionId,
      invoice_line_ids: [
        [
          0,
          0,
          {
            name: `${params.description}\n${lineNote}`,
            quantity: 1,
            price_unit: totalDecimal,
            tax_ids: taxId ? [[6, 0, [taxId]]] : [[6, 0, []]],
          },
        ],
      ],
    },
  ]);

  return { odooInvoiceId: invoiceId };
}
