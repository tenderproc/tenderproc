// Single-agent (non-concurrent) retest of the AI chat + eligibility-checker,
// to distinguish "broken feature" from "overloaded by 10 parallel QA agents."
// Uses free_novice, which had a 100% failure rate (10/10 chat, 2/2
// eligibility) during the concurrent 10-persona audit run.
import { launchPersona, goto, shot, openSupportChat, sendSupportChatMessage, runEligibilityCheck } from "./qa-lib.mjs";

const { browser, context, page } = await launchPersona("free_novice", { headless: true });

const results = { chat: [], eligibility: [] };

// --- Chat: same two question types that failed before ---
await goto(page, "/opportunities");
await openSupportChat(page);

const q1 = "What's the deadline for tender 597390-2026?";
const t1 = Date.now();
await sendSupportChatMessage(page, q1, { waitMs: 12000 });
let text = await page.locator("body").innerText();
const a1 = text.split(q1).pop()?.trim().slice(0, 500);
results.chat.push({ question: q1, answer: a1, ms: Date.now() - t1 });
await shot(page, "retest-01-chat-deadline");

const q2 = "Tell me about tender 999999-2099";
const t2 = Date.now();
await sendSupportChatMessage(page, q2, { waitMs: 12000 });
text = await page.locator("body").innerText();
const a2 = text.split(q2).pop()?.trim().slice(0, 500);
results.chat.push({ question: q2, answer: a2, ms: Date.now() - t2 });
await shot(page, "retest-02-chat-faketender");

// --- Eligibility check on the same reference tender that failed before ---
await goto(page, "/tenders/597390-2026");
const t3 = Date.now();
await runEligibilityCheck(page);
text = await page.locator("body").innerText();
const elig = text.slice(-1200);
results.eligibility.push({ tender: "597390-2026", result: elig, ms: Date.now() - t3 });
await shot(page, "retest-03-eligibility");

console.log(JSON.stringify(results, null, 2));

await browser.close();
