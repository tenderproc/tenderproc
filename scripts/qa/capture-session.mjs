// Manual-login session capture for QA test accounts.
//
// Why this exists: the QA audit needs several logged-in accounts to drive
// through Playwright, but account creation / password entry must be done by
// a human, not automated. This script opens a real (headed) browser, lets
// you sign up or log in by hand, then saves the resulting session
// (storageState: cookies + localStorage) to e2e/.auth/<persona-key>.json.
// The QA subagents load that file later and never see or type a password.
//
// Usage:
//   node scripts/qa/capture-session.mjs <persona-key> [signup|login]
//
// Example:
//   node scripts/qa/capture-session.mjs free_it_consultant signup
//   node scripts/qa/capture-session.mjs pro_startup login
//
// (Deliberately takes the bare word "signup"/"login", not a "/signup" path
// — a leading "/" gets mangled into a Windows filesystem path by Git Bash's
// MSYS path conversion on Windows.)

import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const BASE_URL = process.env.QA_BASE_URL ?? "https://www.tenderproc.com";

async function main() {
  const personaKey = process.argv[2];
  const mode = process.argv[3] ?? "signup";

  if (!personaKey || !/^[a-z0-9_]+$/.test(personaKey)) {
    console.error("Usage: node scripts/qa/capture-session.mjs <persona-key> [signup|login]");
    console.error("  persona-key must be lowercase letters/digits/underscore, e.g. free_it_consultant");
    process.exit(1);
  }
  if (mode !== "signup" && mode !== "login") {
    console.error('mode must be "signup" or "login"');
    process.exit(1);
  }
  const startPath = `/${mode}`;

  const outDir = path.join(process.cwd(), "e2e", ".auth");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${personaKey}.json`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(new URL(startPath, BASE_URL).toString());

  console.log("\n=================================================================");
  console.log(`A real browser window is open at ${BASE_URL}${startPath}`);
  console.log("Please sign up (or log in) by hand in that window, using whatever");
  console.log("email/password/company details you want for this test account.");
  console.log("");
  console.log("IMPORTANT: if a confirmation email is required, open/click it INSIDE");
  console.log("THIS SAME browser window (e.g. Ctrl+T for a new tab in it, or paste");
  console.log("the link into this window's address bar) — NOT your regular default");
  console.log("browser. The login session only gets captured if it's established in");
  console.log("this exact window.");
  console.log("");
  console.log("Wait until you land on the dashboard (fully logged in) IN THIS WINDOW,");
  console.log("then come back to this terminal and press Enter.");
  console.log("=================================================================\n");

  const rl = readline.createInterface({ input: process.stdin });
  const waitForEnter = () =>
    new Promise((resolve) => rl.question("Press Enter once logged in... ", resolve));

  for (;;) {
    await waitForEnter();
    const cookies = await context.cookies();
    const hasSession = cookies.some(
      (c) => /-auth-token(\.\d+)?$/.test(c.name) && !c.name.endsWith("-code-verifier")
    );
    if (hasSession) break;
    console.log(
      "\nNo real login session cookie found yet in this window (only saw locale/PKCE " +
        "code-verifier cookies, if any). This usually means the confirmation link was " +
        "opened in a different browser. Finish logging in inside THIS window, then press Enter again."
    );
  }
  rl.close();

  await context.storageState({ path: outFile });
  console.log(`\nSaved session for "${personaKey}" -> ${outFile}`);
  await browser.close();
}

main();
