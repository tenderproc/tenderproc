import { launchPersona, goto } from "./qa-lib.mjs";

const { browser, context, page } = await launchPersona("free_novice", { headless: true });

await goto(page, "/opportunities");

const t0 = Date.now();
const btn = page.getByRole("button", { name: /Ouvrir le chat d'assistance|Open support chat/i });
await btn.click();
await page.waitForTimeout(500);
const input = page.getByPlaceholder(/Écrivez votre message|Write your message/i);
await input.fill("What's the deadline for tender 597390-2026?");

const responsePromise = page.waitForResponse((r) => r.url().includes("/api/chat"), { timeout: 30000 });
await input.press("Enter");
const res = await responsePromise.catch((e) => ({ error: String(e) }));
const elapsedMs = Date.now() - t0;

let body = null;
if (res && typeof res.text === "function") {
  body = await res.text().catch(() => null);
}

console.log("Elapsed until /api/chat response:", elapsedMs, "ms");
console.log("Status:", res && typeof res.status === "function" ? res.status() : res);
console.log("Body:", body);

await browser.close();
