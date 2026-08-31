import { chromium } from "@playwright/test";

const BASE_URL = "https://www.tenderproc.com";
const STATE = "e2e/.auth/free_it_consultant.json";
const id = process.argv[2];
if (!id) {
  console.error("Usage: node scripts/qa/dump-tender-detail.mjs <tender-id>");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STATE });
const page = await context.newPage();

await page.goto(`${BASE_URL}/tenders/${encodeURIComponent(id)}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

console.log("URL:", page.url());
const text = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
console.log(text);

await browser.close();
