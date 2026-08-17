// Creates/updates TenderProc's Paddle product catalog (Pro + Premium)
// idempotently, so sandbox and production end up identically configured
// without manually re-clicking through the Paddle dashboard twice. Not part
// of the deployed app — run manually via:
//
//   npx tsx scripts/setup-paddle-catalog.ts [--env-file=.env.local] [--yes]
//   npx tsx scripts/setup-paddle-catalog.ts --env-file=.env.production.local --production
//
// Idempotency key: each Product/Price is tagged with custom_data.internal_tier
// ("pro"/"premium") — re-running the script looks products/prices up by that
// field (not by name or amount, which can legitimately change) and only
// creates what's missing. Product name/description/taxCategory are updated
// in place if they've drifted from what's below. Price *amount/interval*
// are NOT auto-updated (see upsertPrice) — changing a live Price's amount
// reprices every subscriber on it, so that requires --allow-price-changes
// and prints a loud warning first.
//
// Every field name and enum value here was read directly from
// @paddle/paddle-node-sdk's own .d.ts files (node_modules/@paddle/paddle-node-sdk/dist/types/...),
// not guessed from docs prose — see the PR/commit description for specifics.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import type { CurrencyCode, Price, Product, TaxCategory } from "@paddle/paddle-node-sdk";

// ---------------------------------------------------------------------------
// CLI args + env file loading
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const envFileArg = args.find((a) => a.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.slice("--env-file=".length) : ".env.local";
const productionFlag = args.includes("--production");
const yesFlag = args.includes("--yes");
const allowPriceChangesFlag = args.includes("--allow-price-changes");

// Thrown for expected, "stop and tell the user why" exits — caught at the
// bottom and printed as a plain message (no stack). Used instead of
// process.exit() everywhere in this script: forcing an immediate exit while
// tsx's esbuild worker or the readline/stdin handle is still attached can
// race libuv's handle-close bookkeeping on Windows ("Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING)"). Throwing lets main() unwind and
// the process exit naturally once the event loop drains.
class ScriptExit extends Error {}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    throw new ScriptExit(`Env file not found: ${path}`);
  }
  // Minimal .env parser — no dotenv dependency in this project. Doesn't
  // support multi-line values or $VAR expansion; TenderProc's env files
  // don't use either.
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ScriptExit(`Missing required env var ${name} in ${envFile}`);
  }
  return value;
}

async function confirm(promptText: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(promptText);
  rl.close();
  // rl.close() alone leaves stdin's read handle open on Windows, which then
  // races libuv's handle-close bookkeeping if the process exits (including
  // via a later process.exit() call) before the handle finishes tearing
  // down — surfaces as "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
  // Pausing releases the handle immediately instead of leaving it pending.
  process.stdin.pause();
  return answer.trim();
}

// ---------------------------------------------------------------------------
// Catalog definition — copy pulled verbatim from messages/en.json's
// Pricing.tiers section (app/pricing/page.tsx), not invented.
// ---------------------------------------------------------------------------

interface TierSpec {
  key: "pro" | "premium";
  envVarName: "PADDLE_PRICE_ID_PRO" | "PADDLE_PRICE_ID_PREMIUM";
  productName: string;
  description: string;
  /** Paddle wants integer minor units as a string, e.g. "4900" = €49.00 — not a decimal. */
  amountMinorUnits: string;
}

const TIERS: TierSpec[] = [
  {
    key: "pro",
    envVarName: "PADDLE_PRICE_ID_PRO",
    productName: "TenderProc Pro",
    description:
      "For SMEs actively bidding on Belgian public tenders. Includes the opportunities feed for all sectors, " +
      "AI match scores on every tender, the workflow pipeline board, and daily email notifications.",
    amountMinorUnits: "4900",
  },
  {
    key: "premium",
    envVarName: "PADDLE_PRICE_ID_PREMIUM",
    productName: "TenderProc Premium",
    description:
      "For teams that want the full Belgian public tender market picture. Includes everything in Pro, plus " +
      "market overview & award analytics, AI eligibility checks, and priority support.",
    amountMinorUnits: "7900",
  },
];

const CURRENCY_CODE: CurrencyCode = "EUR";
const TAX_CATEGORY: TaxCategory = "saas"; // Confirmed valid value on TaxCategory — see script header.
const BILLING_CYCLE = { interval: "month" as const, frequency: 1 };

interface ResultRow {
  spec: TierSpec;
  product: Product;
  productAction: string;
  price: Price;
  priceAction: string;
}

async function main(): Promise<void> {
  loadEnvFile(envFile);

  // ---- Production safety gate — no flag combination bypasses the typed prompt. ----
  const isProduction = process.env.PADDLE_ENV === "production";

  if (isProduction && !productionFlag) {
    throw new ScriptExit(
      `\nPADDLE_ENV=production in ${envFile}, but --production was not passed.\n` +
        `Refusing to run against production without an explicit --production flag.\n\n` +
        `Re-run as:\n  npx tsx scripts/setup-paddle-catalog.ts --env-file=${envFile} --production\n`
    );
  }

  if (isProduction) {
    const answer = await confirm(
      `\n⚠️  PRODUCTION — this will create/update LIVE Paddle products and prices,\n` +
        `visible to real customers on checkout. Env file: ${envFile}\n\n` +
        `Type PRODUCTION (all caps) to continue: `
    );
    if (answer !== "PRODUCTION") {
      throw new ScriptExit("Confirmation did not match. Aborting — nothing was changed.");
    }
  } else if (!yesFlag) {
    const answer = await confirm(`\nRunning against SANDBOX (${envFile}). Continue? [y/N] `);
    if (answer.toLowerCase() !== "y") {
      throw new ScriptExit("Aborted — nothing was changed.");
    }
  }

  const paddle = new Paddle(requireEnv("PADDLE_API_KEY"), {
    environment: isProduction ? Environment.production : Environment.sandbox,
  });

  async function findProductByTier(tierKey: string): Promise<Product | null> {
    for await (const product of paddle.products.list({ status: ["active"] })) {
      if (product.customData?.internal_tier === tierKey) return product;
    }
    return null;
  }

  async function findPriceByTier(productId: string, tierKey: string): Promise<Price | null> {
    for await (const price of paddle.prices.list({ productId: [productId], status: ["active"] })) {
      if (price.customData?.internal_tier === tierKey) return price;
    }
    return null;
  }

  async function upsertProduct(spec: TierSpec): Promise<{ product: Product; action: "created" | "updated" | "unchanged" }> {
    const existing = await findProductByTier(spec.key);

    if (!existing) {
      const product = await paddle.products.create({
        name: spec.productName,
        taxCategory: TAX_CATEGORY,
        description: spec.description,
        customData: { internal_tier: spec.key },
      });
      return { product, action: "created" };
    }

    const driftedFields =
      existing.name !== spec.productName || existing.description !== spec.description || existing.taxCategory !== TAX_CATEGORY;

    if (!driftedFields) return { product: existing, action: "unchanged" };

    const product = await paddle.products.update(existing.id, {
      name: spec.productName,
      description: spec.description,
      taxCategory: TAX_CATEGORY,
    });
    return { product, action: "updated" };
  }

  async function upsertPrice(
    spec: TierSpec,
    product: Product
  ): Promise<{ price: Price; action: "created" | "updated" | "unchanged" | "skipped-drift" }> {
    const existing = await findPriceByTier(product.id, spec.key);
    const desiredUnitPrice = { amount: spec.amountMinorUnits, currencyCode: CURRENCY_CODE };

    if (!existing) {
      const price = await paddle.prices.create({
        productId: product.id,
        description: `${spec.productName} — monthly subscription`,
        unitPrice: desiredUnitPrice,
        billingCycle: BILLING_CYCLE,
        customData: { internal_tier: spec.key },
      });
      return { price, action: "created" };
    }

    const amountDrifted =
      existing.unitPrice.amount !== desiredUnitPrice.amount || existing.unitPrice.currencyCode !== desiredUnitPrice.currencyCode;
    const intervalDrifted =
      existing.billingCycle?.interval !== BILLING_CYCLE.interval || existing.billingCycle?.frequency !== BILLING_CYCLE.frequency;

    if (!amountDrifted && !intervalDrifted) return { price: existing, action: "unchanged" };

    if (!allowPriceChangesFlag) {
      console.warn(
        `\n⚠️  ${spec.productName}'s existing price (${existing.id}) doesn't match the amount/interval below and was ` +
          `left untouched — changing a live Price's amount reprices every current subscriber on it, so this script ` +
          `won't do it silently.\n` +
          `   Existing: ${existing.unitPrice.amount} ${existing.unitPrice.currencyCode} / ${existing.billingCycle?.frequency ?? "?"} ${existing.billingCycle?.interval ?? "?"}\n` +
          `   Desired:  ${desiredUnitPrice.amount} ${desiredUnitPrice.currencyCode} / ${BILLING_CYCLE.frequency} ${BILLING_CYCLE.interval}\n` +
          `   Re-run with --allow-price-changes if this change is intentional.`
      );
      return { price: existing, action: "skipped-drift" };
    }

    const price = await paddle.prices.update(existing.id, {
      unitPrice: desiredUnitPrice,
      billingCycle: BILLING_CYCLE,
    });
    return { price, action: "updated" };
  }

  // ---- Run ----
  const results: ResultRow[] = [];

  for (const spec of TIERS) {
    console.log(`\n— ${spec.productName} —`);
    const { product, action: productAction } = await upsertProduct(spec);
    console.log(`  Product ${productAction}: ${product.id}`);

    const { price, action: priceAction } = await upsertPrice(spec, product);
    console.log(`  Price ${priceAction}: ${price.id}`);

    results.push({ spec, product, productAction, price, priceAction });
  }

  // ---- Env var output ----
  const envLines = results.flatMap(({ spec, price }) => [
    `${spec.envVarName}=${price.id}`,
    `NEXT_PUBLIC_${spec.envVarName}=${price.id}`,
  ]);

  const envBlock = envLines.join("\n");

  console.log(`\n\n===== Paste into your env file (${envFile}) =====\n`);
  console.log(envBlock);
  console.log(`\n===================================================\n`);

  const outFile = ".env.paddle-ids";
  writeFileSync(outFile, envBlock + "\n", "utf8");
  console.log(`Also written to ${outFile} (gitignored).\n`);

  // ---- Verification table — fetches back from Paddle rather than trusting the in-memory objects. ----
  console.log(`Verification (fetched back from Paddle, ${isProduction ? "PRODUCTION" : "sandbox"}):\n`);

  const rows: string[][] = [["Name", "Price", "Interval", "Tax category", "internal_tier", "Product ID", "Price ID"]];

  for (const { spec, product: createdProduct, price: createdPrice } of results) {
    void spec;
    const product = await paddle.products.get(createdProduct.id);
    const price = await paddle.prices.get(createdPrice.id);
    rows.push([
      product.name,
      `${(Number(price.unitPrice.amount) / 100).toFixed(2)} ${price.unitPrice.currencyCode}`,
      `${price.billingCycle?.frequency ?? "?"}/${price.billingCycle?.interval ?? "?"}`,
      product.taxCategory,
      String(product.customData?.internal_tier ?? "(none)"),
      product.id,
      price.id,
    ]);
  }

  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join("  |  "));
  }

  console.log(
    `\nCompare the Price/Interval columns above against app/pricing/page.tsx and messages/en.json's ` +
      `Pricing.tiers before wiring these IDs in.\n`
  );
}

main().catch((err) => {
  // ScriptExit's message is already a complete, user-facing explanation —
  // print it plain. Anything else is unexpected, so show the full error
  // (stack included) to help diagnose it, same as an uncaught exception would.
  if (err instanceof ScriptExit) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  // exitCode (not exit()) lets the process shut down once the event loop
  // drains naturally instead of forcing an immediate kill — see ScriptExit's
  // comment above for why that matters here.
  process.exitCode = 1;
});
