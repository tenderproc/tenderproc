// Persona 1: Freelance IT consultant, Brussels. Fast, impatient, wants to
// know if the tool is worth EUR49/mo. Tests homepage, dashboard/opportunities
// flow, tender detail + eligibility check, pricing/checkout (stop before pay),
// and support chat (accuracy, relevance, hallucination, tone, handoff).
import { launchPersona, goto, shot, openSupportChat, sendSupportChatMessage, getSupportChatText, waitForMatchFiltering, runEligibilityCheck, log } from "./qa-lib.mjs";

const P = "persona01";
const findings = [];

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

const { browser, context, page } = await launchPersona("free_it_consultant", { headless: true, viewport: { width: 1440, height: 900 } });

try {
  // 1. Homepage cold landing
  await goto(page, "/");
  await shot(page, `${P}-01-homepage`);
  note("Landed on homepage.");

  // 2. Profile check
  try {
    await goto(page, "/profile");
    await shot(page, `${P}-02-profile-attempt`);
  } catch (e) {
    note(`Direct /profile nav failed: ${e.message}`);
  }

  // 3. Dashboard / opportunities
  await goto(page, "/opportunities");
  await shot(page, `${P}-03-opportunities-initial`);
  note("Loaded /opportunities.");

  await page.waitForTimeout(2000);
  await shot(page, `${P}-04-opportunities-settled`);

  // Reference tender detail pages
  const refTenders = ["597390-2026", "597651-2026", "598497-2026"];
  for (const id of refTenders) {
    try {
      await goto(page, `/tenders/${id}`);
      await page.waitForTimeout(1000);
      await shot(page, `${P}-05-tender-${id}`);
      const text = await page.locator("body").innerText();
      note(`Tender ${id} page loaded. Snippet: ${text.slice(0, 300).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Tender ${id} failed to load: ${e.message}`);
    }
  }

  // Eligibility check on first reference tender
  try {
    await goto(page, `/tenders/${refTenders[0]}`);
    await page.waitForTimeout(1000);
    await runEligibilityCheck(page);
    await shot(page, `${P}-06-eligibility-${refTenders[0]}`);
    const text = await page.locator("body").innerText();
    note(`Eligibility check ran on ${refTenders[0]}. Page text snippet after check: ${text.slice(0, 1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Eligibility check on ${refTenders[0]} failed: ${e.message}`);
  }

  // Eligibility check on second reference tender (budget accuracy check)
  try {
    await goto(page, `/tenders/${refTenders[1]}`);
    await page.waitForTimeout(1000);
    await runEligibilityCheck(page);
    await shot(page, `${P}-07-eligibility-${refTenders[1]}`);
    const text = await page.locator("body").innerText();
    note(`Eligibility check ran on ${refTenders[1]}. Page text snippet after check: ${text.slice(0, 1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Eligibility check on ${refTenders[1]} failed: ${e.message}`);
  }

  // 4. Pricing / upgrade page
  try {
    await goto(page, "/pricing");
    await shot(page, `${P}-08-pricing`);
    note("Loaded /pricing.");
  } catch (e) {
    note(`/pricing failed: ${e.message}`);
  }

  // Try to start checkout for Pro plan
  try {
    const proBtn = page.getByRole("button", { name: /Pro/i }).or(page.getByRole("link", { name: /Pro/i })).first();
    const upgradeBtn = page.getByRole("button", { name: /S'abonner|Upgrade|Subscribe|Passer.*Pro|Choisir/i }).first();
    let clicked = false;
    if (await upgradeBtn.count()) {
      await upgradeBtn.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
    } else if (await proBtn.count()) {
      await proBtn.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
    }
    await page.waitForTimeout(3000);
    await shot(page, `${P}-09-checkout-attempt`);
    note(`Attempted to start Pro checkout, clicked=${clicked}.`);
  } catch (e) {
    note(`Checkout start failed: ${e.message}`);
  }

  // 5. Support chat: accuracy check re reference tender
  await goto(page, "/");
  try {
    await openSupportChat(page);
    await shot(page, `${P}-10-chat-open`);
    await sendSupportChatMessage(page, "What is the estimated budget for tender 597390-2026?", { waitMs: 12000 });
    const t1 = await getSupportChatText(page);
    await shot(page, `${P}-11-chat-budget-q`);
    note(`Chat Q1 (budget 597390-2026) response snippet: ${t1.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q1 failed: ${e.message}`);
  }

  // Hallucination check - fake tender
  try {
    await sendSupportChatMessage(page, "Tell me about tender 999999-2099.", { waitMs: 12000 });
    const t2 = await getSupportChatText(page);
    await shot(page, `${P}-12-chat-fake-tender`);
    note(`Chat Q2 (fake tender 999999-2099) response snippet: ${t2.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q2 failed: ${e.message}`);
  }

  // Hallucination check - fake pricing plan
  try {
    await sendSupportChatMessage(page, "Do you have an Enterprise plan at 199 euros per month?", { waitMs: 12000 });
    const t3 = await getSupportChatText(page);
    await shot(page, `${P}-13-chat-fake-plan`);
    note(`Chat Q3 (fake Enterprise plan) response snippet: ${t3.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q3 failed: ${e.message}`);
  }

  // Handoff check - explicit human help request
  try {
    await sendSupportChatMessage(page, "I want to speak to a human, please.", { waitMs: 12000 });
    const t4 = await getSupportChatText(page);
    await shot(page, `${P}-14-chat-human-handoff`);
    note(`Chat Q4 (explicit human handoff) response snippet: ${t4.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q4 failed: ${e.message}`);
  }

  // Handoff check - something bot plausibly can't answer
  try {
    await sendSupportChatMessage(page, "Can you cancel my subscription and refund my last payment right now?", { waitMs: 12000 });
    const t5 = await getSupportChatText(page);
    await shot(page, `${P}-15-chat-cancel-refund`);
    note(`Chat Q5 (cancel/refund request) response snippet: ${t5.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q5 failed: ${e.message}`);
  }

} finally {
  await browser.close();
}

console.log("\n\n=== ALL FINDINGS ===\n");
console.log(findings.join("\n\n---\n\n"));
