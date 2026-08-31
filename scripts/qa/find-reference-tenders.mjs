// Dumps the first N tenders visible on the Opportunities feed (using a
// captured session) with as much structured detail as we can scrape, so we
// can pick 2-3 as ground truth for the QA audit's AI-accuracy checks.
import { chromium } from "@playwright/test";

const BASE_URL = "https://www.tenderproc.com";
const STATE = "e2e/.auth/free_it_consultant.json";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STATE });
const page = await context.newPage();

await page.goto(`${BASE_URL}/opportunities`, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(1000);

// The match-threshold filter is a real <select>, not clickable text — pick
// the lowest threshold ("Toute correspondance" / Any match) so we see
// everything, then trigger the search.
const select = page.locator("select").first();
if (await select.count()) {
  await select.selectOption({ label: "Toute correspondance" }).catch(async () => {
    await select.selectOption({ index: 0 }).catch(() => {});
  });
}
const searchBtn = page.getByRole("button", { name: /Rechercher|Search/i }).first();
if (await searchBtn.count()) {
  await searchBtn.click().catch(() => {});
}
await page.waitForTimeout(2000);
// The match-filtering step runs real AI scoring per tender — give it real time.
await page
  .getByText(/Filtrage par|Filtering/i)
  .waitFor({ state: "detached", timeout: 45000 })
  .catch(() => {});
await page.waitForTimeout(1500);

console.log("URL after nav:", page.url());
console.log("Title:", await page.title());

// Grab visible text of the main content area for a first look.
const bodyText = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
console.log("\n----- PAGE TEXT (first 4000 chars) -----\n");
console.log(bodyText.slice(0, 4000));

await page.screenshot({ path: "test-reports/screenshots/_ref-tenders-feed.png", fullPage: true });

// Try to find links to individual tender detail pages.
const links = await page.locator("a").evaluateAll((as) =>
  as
    .map((a) => ({ href: a.getAttribute("href"), text: a.textContent?.trim() }))
    .filter((l) => l.href && /opportunit|tender/i.test(l.href))
);
console.log("\n----- CANDIDATE DETAIL LINKS -----\n");
console.log(JSON.stringify(links.slice(0, 30), null, 2));

await browser.close();
