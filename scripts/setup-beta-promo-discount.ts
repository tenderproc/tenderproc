// Creates TenderProc's beta feedback promo discount in Paddle: 50% off,
// recurring for 6 billing cycles, capped at 20 total redemptions, restricted
// to the Pro/Premium prices. Not part of the deployed app — run manually via:
//
//   npx tsx scripts/setup-beta-promo-discount.ts [--env-file=.env.local] [--yes]
//   npx tsx scripts/setup-beta-promo-discount.ts --env-file=.env.production.local --production
//
// Idempotency: looks up an existing discount by customData.internal_promo
// ("beta_feedback_v1") before creating a new one, same lookup-by-custom_data
// pattern as scripts/setup-paddle-catalog.ts (never by code/description,
// which can legitimately change). Prints the resulting discount id to set
// as PADDLE_BETA_PROMO_DISCOUNT_ID — that env var, not this script, is what
// the app actually reads (lib/billing/betaPromo.ts).
//
// Every field name/enum here was read directly from @paddle/paddle-node-sdk's
// own .d.ts files (node_modules/@paddle/paddle-node-sdk/dist/types/resources/discounts/...),
// not guessed from docs prose.

import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

const args = process.argv.slice(2);
const envFileArg = args.find((a) => a.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.slice("--env-file=".length) : ".env.local";
const productionFlag = args.includes("--production");
const yesFlag = args.includes("--yes");

// See scripts/setup-paddle-catalog.ts for why ScriptExit + exitCode (not
// process.exit()) is used throughout instead of throwing raw or exiting
// immediately — avoids a libuv handle-close race on Windows.
class ScriptExit extends Error {}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) throw new ScriptExit(`Env file not found: ${path}`);
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
  if (!value) throw new ScriptExit(`Missing required env var ${name} in ${envFile}`);
  return value;
}

async function confirm(promptText: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(promptText);
  rl.close();
  process.stdin.pause();
  return answer.trim();
}

const INTERNAL_PROMO_KEY = "beta_feedback_v1";

async function main(): Promise<void> {
  loadEnvFile(envFile);

  const isProduction = process.env.PADDLE_ENV === "production";

  if (isProduction && !productionFlag) {
    throw new ScriptExit(
      `\nPADDLE_ENV=production in ${envFile}, but --production was not passed.\n` +
        `Refusing to run against production without an explicit --production flag.\n\n` +
        `Re-run as:\n  npx tsx scripts/setup-beta-promo-discount.ts --env-file=${envFile} --production\n`
    );
  }

  if (isProduction) {
    const answer = await confirm(
      `\n⚠️  PRODUCTION — this will create a LIVE Paddle discount, redeemable by real customers\n` +
        `at checkout for 50% off 6 months. Env file: ${envFile}\n\n` +
        `Type PRODUCTION (all caps) to continue: `
    );
    if (answer !== "PRODUCTION") throw new ScriptExit("Confirmation did not match. Aborting — nothing was changed.");
  } else if (!yesFlag) {
    const answer = await confirm(`\nRunning against SANDBOX (${envFile}). Continue? [y/N] `);
    if (answer.toLowerCase() !== "y") throw new ScriptExit("Aborted — nothing was changed.");
  }

  const paddle = new Paddle(requireEnv("PADDLE_API_KEY"), {
    environment: isProduction ? Environment.production : Environment.sandbox,
  });
  const proPriceId = requireEnv("PADDLE_PRICE_ID_PRO");
  const premiumPriceId = requireEnv("PADDLE_PRICE_ID_PREMIUM");

  let existing = null;
  for await (const discount of paddle.discounts.list({ status: ["active"] })) {
    if (discount.customData?.internal_promo === INTERNAL_PROMO_KEY) {
      existing = discount;
      break;
    }
  }

  if (existing) {
    console.log(`\nBeta promo discount already exists: ${existing.id} (code: ${existing.code})`);
    console.log(`Nothing created. Set this in your env file if it isn't already:\n`);
    console.log(`PADDLE_BETA_PROMO_DISCOUNT_ID=${existing.id}\n`);
    return;
  }

  const discount = await paddle.discounts.create({
    description: "Beta feedback promo — 50% off 6 months, first 20 subscribers (internal reference only)",
    type: "percentage",
    amount: "50",
    code: "BETA20",
    enabledForCheckout: true,
    recur: true,
    maximumRecurringIntervals: 6,
    usageLimit: 20,
    restrictTo: [proPriceId, premiumPriceId],
    customData: { internal_promo: INTERNAL_PROMO_KEY },
  });

  console.log(`\nCreated discount ${discount.id} (code: ${discount.code}).`);
  console.log(`\n===== Paste into your env file (${envFile}) =====\n`);
  console.log(`PADDLE_BETA_PROMO_DISCOUNT_ID=${discount.id}`);
  console.log(`\n===================================================\n`);
  console.log(
    `Note: this env var is server-only, deliberately not exposed as NEXT_PUBLIC_* — UpgradeButton\n` +
      `fetches it fresh per-checkout via POST /api/billing/promo/reserve, which also re-validates\n` +
      `eligibility (20-slot cap, one-per-customer) against our DB right before returning it.\n`
  );
}

main().catch((err) => {
  if (err instanceof ScriptExit) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
