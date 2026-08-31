// Shared helpers for the multi-persona QA audit. Import from your persona
// script: `import { launchPersona, shot, openSupportChat, sendSupportChatMessage,
// setAnyMatchFilter, openEligibilityCheck } from "./qa-lib.mjs";`
import { chromium } from "@playwright/test";
import path from "node:path";

export const BASE_URL = "https://www.tenderproc.com";
export const SCREENSHOT_DIR = "test-reports/screenshots";

// personaKey: one of the e2e/.auth/<key>.json files, or null/undefined for
// an unauthenticated (logged-out) persona.
export async function launchPersona(personaKey, { headless = true, viewport } = {}) {
  const browser = await chromium.launch({ headless });
  const contextOpts = {};
  if (personaKey) contextOpts.storageState = `e2e/.auth/${personaKey}.json`;
  if (viewport) contextOpts.viewport = viewport;
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { browser, context, page };
}

// Use "domcontentloaded", not "networkidle" — the support-chat widget keeps
// a background connection open, so "networkidle" hangs/times out.
export async function goto(page, urlPath) {
  await page.goto(new URL(urlPath, BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(1500);
}

export async function shot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

// The Opportunities list re-scores tenders against your profile with a real
// AI call per tender; give it real time and don't assume instant results.
export async function waitForMatchFiltering(page, timeout = 45000) {
  await page
    .getByText(/Filtrage par|Filtering/i)
    .waitFor({ state: "detached", timeout })
    .catch(() => {});
  await page.waitForTimeout(1000);
}

export async function setAnyMatchFilter(page) {
  const select = page.locator("select").first();
  if (await select.count()) {
    await select.selectOption({ label: "Toute correspondance" }).catch(async () => {
      await select.selectOption({ index: 0 }).catch(() => {});
    });
  }
  const searchBtn = page.getByRole("button", { name: /Rechercher|Search/i }).first();
  if (await searchBtn.count()) await searchBtn.click().catch(() => {});
  await waitForMatchFiltering(page);
}

// Floating general support-chat widget (bottom-right bubble). NOT grounded
// in specific tender data — good for tone, hallucination, and handoff
// checks, not for "what's the deadline of tender X" (it will correctly say
// it doesn't know — that's the right behavior, not a bug).
export async function openSupportChat(page) {
  const btn = page.getByRole("button", { name: /Ouvrir le chat d'assistance|Open support chat/i });
  await btn.click();
  await page.waitForTimeout(800);
}

export async function sendSupportChatMessage(page, message, { waitMs = 10000 } = {}) {
  const input = page.getByPlaceholder(/Écrivez votre message|Type your message/i);
  await input.fill(message);
  await input.press("Enter");
  await page.waitForTimeout(waitMs);
}

// Returns the chat transcript's visible text (best-effort — the widget has
// no isolated container we found, so this grabs page text and the caller
// should diff/slice around their sent message).
export async function getSupportChatText(page) {
  return page.locator("body").innerText();
}

// On a /tenders/<id> detail page: the "Vérifier l'éligibilité" tool IS
// grounded in that specific tender's notice data. Optionally pass
// requirementsText to paste into the box; otherwise it runs on notice
// metadata only.
export async function runEligibilityCheck(page, requirementsText) {
  if (requirementsText) {
    const box = page.locator("textarea").first();
    if (await box.count()) await box.fill(requirementsText);
  }
  const btn = page.getByRole("button", { name: /Lancer la vérification|Run.*check/i });
  await btn.click();
  await page.waitForTimeout(12000);
}

export function log(persona, ...args) {
  console.log(`[${persona}]`, ...args);
}
