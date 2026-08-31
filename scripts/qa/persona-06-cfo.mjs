// Persona 6: Accountant/CFO type, mid-size company ("Meersman Group NV",
// Antwerp, professional/business services). Focus: billing clarity,
// Paddle checkout (VAT, currency, frequency), Terms/Refund policy clarity,
// cancellation self-service, and AI accuracy/hallucination on money matters.
import { launchPersona, goto, shot, openSupportChat, sendSupportChatMessage, getSupportChatText, log } from "./qa-lib.mjs";

const P = "persona06";
const findings = [];
const t0 = Date.now();

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

function elapsed() {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

const { browser, context, page } = await launchPersona("premium_cfo", {
  headless: true,
  viewport: { width: 1440, height: 900 },
});

try {
  // 1. Homepage cold landing
  await goto(page, "/");
  await shot(page, `${P}-01-homepage`);
  note(`[t=${elapsed()}] Homepage loaded.`);

  // 2. Verify actual profile
  try {
    await goto(page, "/profile");
    await shot(page, `${P}-02-profile`);
    const profileText = await page.locator("body").innerText();
    note(`[t=${elapsed()}] /profile loaded. Snippet: ${profileText.slice(0, 1000).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Direct /profile nav failed: ${e.message}. Trying nav link.`);
    try {
      await goto(page, "/");
      const profLink = page.getByRole("link", { name: /Mon profil|My profile|Profil/i }).first();
      if (await profLink.count()) {
        await profLink.click();
        await page.waitForTimeout(1500);
        await shot(page, `${P}-02b-profile-via-nav`);
        const profileText2 = await page.locator("body").innerText();
        note(`Profile via nav link. Snippet: ${profileText2.slice(0, 1000).replace(/\s+/g, " ")}`);
      } else {
        note("Could not find a profile nav link either.");
      }
    } catch (e2) {
      note(`Profile via nav also failed: ${e2.message}`);
    }
  }

  // 3. Billing/Facturation page
  let billingUrl = null;
  try {
    await goto(page, "/");
    const billingLink = page.getByRole("link", { name: /Facturation|Billing/i }).first();
    if (await billingLink.count()) {
      billingUrl = await billingLink.getAttribute("href");
      await billingLink.click();
      await page.waitForTimeout(2000);
    } else {
      note("No 'Facturation'/'Billing' nav link found on homepage header; trying /billing directly.");
      await goto(page, "/billing");
    }
    await shot(page, `${P}-03-billing-page`);
    const billingText = await page.locator("body").innerText();
    note(`[t=${elapsed()}] Billing page loaded (href=${billingUrl}). Full-ish snippet for CFO clarity judgment (current plan / next billing date / invoice history / empty-state explanation): ${billingText.slice(0, 3000).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Billing page navigation failed: ${e.message}`);
  }

  // 4. Pricing page — VAT/tax mention, ex/inc VAT labeling
  try {
    await goto(page, "/pricing");
    await shot(page, `${P}-04-pricing`);
    const pricingText = await page.locator("body").innerText();
    note(`[t=${elapsed()}] /pricing loaded. Full snippet (check for VAT/TVA/tax mention, ex-VAT vs inc-VAT labeling, currency): ${pricingText.slice(0, 3000).replace(/\s+/g, " ")}`);
    const hasVatMention = /VAT|TVA|BTW|tax|hors taxe|incl\.|excl\./i.test(pricingText);
    note(`VAT/tax keyword found on pricing page: ${hasVatMention}`);
  } catch (e) {
    note(`/pricing failed: ${e.message}`);
  }

  // 5a. Start Pro checkout (stop before payment)
  try {
    await goto(page, "/pricing");
    const proBtn = page
      .getByRole("button", { name: /Pro/i })
      .or(page.getByRole("link", { name: /Pro/i }))
      .first();
    let clicked = false;
    if (await proBtn.count()) {
      await proBtn.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
    }
    await page.waitForTimeout(5000);
    await shot(page, `${P}-05a-checkout-pro`);
    const checkoutText = await page.locator("body").innerText().catch(() => "");
    note(`[t=${elapsed()}] Attempted Pro (€49) checkout start, clicked=${clicked}. STOPPED before any payment confirmation. Snippet (check currency/VAT line/frequency/next-steps copy): ${checkoutText.slice(0, 2000).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Pro checkout start failed: ${e.message}`);
  }

  // 5b. Start Premium checkout (stop before payment)
  try {
    await goto(page, "/pricing");
    const premiumBtn = page
      .getByRole("button", { name: /Premium/i })
      .or(page.getByRole("link", { name: /Premium/i }))
      .first();
    let clicked = false;
    if (await premiumBtn.count()) {
      await premiumBtn.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
    }
    await page.waitForTimeout(5000);
    await shot(page, `${P}-05b-checkout-premium`);
    const checkoutText2 = await page.locator("body").innerText().catch(() => "");
    note(`[t=${elapsed()}] Attempted Premium (€79) checkout start, clicked=${clicked}. STOPPED before any payment confirmation. Snippet (check currency/VAT line/frequency/next-steps copy): ${checkoutText2.slice(0, 2000).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Premium checkout start failed: ${e.message}`);
  }

  // 6. Terms of Service + Refund Policy — find via footer links
  let termsHref = null;
  let refundHref = null;
  try {
    await goto(page, "/");
    const footerText = await page.locator("footer").innerText().catch(() => "");
    note(`Footer text snippet: ${footerText.slice(0, 1000).replace(/\s+/g, " ")}`);
    const termsLink = page.locator("footer").getByRole("link", { name: /Terms|Conditions/i }).first();
    const refundLink = page.locator("footer").getByRole("link", { name: /Refund|Remboursement/i }).first();
    if (await termsLink.count()) termsHref = await termsLink.getAttribute("href");
    if (await refundLink.count()) refundHref = await refundLink.getAttribute("href");
    note(`Footer links found: terms=${termsHref}, refund=${refundHref}`);
  } catch (e) {
    note(`Footer link discovery failed: ${e.message}`);
  }

  try {
    await goto(page, termsHref || "/terms");
    await shot(page, `${P}-06-terms`);
    const termsText = await page.locator("body").innerText();
    note(`[t=${elapsed()}] Terms of Service loaded. Full snippet (look for cancellation notice period, self-cancel instructions): ${termsText.slice(0, 4000).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Terms page failed: ${e.message}`);
  }

  try {
    await goto(page, refundHref || "/refund");
    await shot(page, `${P}-07-refund`);
    const refundText = await page.locator("body").innerText();
    note(`[t=${elapsed()}] Refund Policy loaded. Full snippet (look for prorated refunds y/n, notice period, exact cancellation mechanics): ${refundText.slice(0, 4000).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Refund page failed: ${e.message}`);
  }

  // 7. Check account area for self-service cancel-subscription flow
  try {
    await goto(page, billingUrl || "/billing");
    const cancelBtn = page.getByRole("button", { name: /Annuler|Cancel/i }).first();
    const cancelLink = page.getByRole("link", { name: /Annuler|Cancel|Gérer.*abonnement|Manage.*subscription/i }).first();
    const hasCancelBtn = await cancelBtn.count();
    const hasCancelLink = await cancelLink.count();
    note(`Self-service cancel control on billing page: button=${hasCancelBtn > 0}, link=${hasCancelLink > 0}.`);
    await shot(page, `${P}-08-billing-cancel-check`);
  } catch (e) {
    note(`Cancel-flow check failed: ${e.message}`);
  }

  // 8. Opportunities relevance check for professional/business services profile
  try {
    await goto(page, "/opportunities");
    await page.waitForTimeout(6000);
    await shot(page, `${P}-09-opportunities`);
    const oppText = await page.locator("body").innerText();
    note(`[t=${elapsed()}] Opportunities feed loaded for CFO/professional-services profile. Snippet (judge relevance to mid-size professional services company): ${oppText.slice(0, 2500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Opportunities load failed: ${e.message}`);
  }

  // 9. Support chat — accuracy, billing-vs-policy consistency, hallucination, tone, handoff
  await goto(page, "/");
  try {
    await openSupportChat(page);
    await shot(page, `${P}-10-chat-open`);
  } catch (e) {
    note(`Opening support chat failed: ${e.message}`);
  }

  // 9a. Accuracy: reference tender deadline
  try {
    await sendSupportChatMessage(page, "What is the deadline for tender 597651-2026?", { waitMs: 12000 });
    const t1 = await getSupportChatText(page);
    await shot(page, `${P}-11-chat-deadline-q`);
    note(`Chat Q1 (deadline 597651-2026, ground truth = 08 Sept 2026) response snippet: ${t1.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q1 failed: ${e.message}`);
  }

  // 9b. Refund policy question — compare against actual Refund page text
  try {
    await sendSupportChatMessage(page, "What's your refund policy if I cancel mid-month?", { waitMs: 12000 });
    const t2 = await getSupportChatText(page);
    await shot(page, `${P}-12-chat-refund-policy`);
    note(`Chat Q2 (refund policy mid-month cancel) response snippet — COMPARE THIS CAREFULLY against the actual Refund Policy page text captured above for any contradiction: ${t2.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q2 failed: ${e.message}`);
  }

  // 9c. VAT question — compare against actual pricing page text
  try {
    await sendSupportChatMessage(page, "Do prices include VAT?", { waitMs: 12000 });
    const t3 = await getSupportChatText(page);
    await shot(page, `${P}-13-chat-vat`);
    note(`Chat Q3 (VAT inclusion) response snippet — COMPARE against actual pricing page VAT labeling captured above: ${t3.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q3 failed: ${e.message}`);
  }

  // 9d. Hallucination: fake annual discount plan
  try {
    await sendSupportChatMessage(page, "Is there an annual discount plan available?", { waitMs: 12000 });
    const t4 = await getSupportChatText(page);
    await shot(page, `${P}-14-chat-fake-annual-plan`);
    note(`Chat Q4 (fake/unverified annual discount plan) response snippet: ${t4.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q4 failed: ${e.message}`);
  }

  // 9e. Hallucination: non-existent tender
  try {
    await sendSupportChatMessage(page, "Can you tell me about tender 999999-2099?", { waitMs: 12000 });
    const t5 = await getSupportChatText(page);
    await shot(page, `${P}-15-chat-fake-tender`);
    note(`Chat Q5 (fake tender 999999-2099) response snippet: ${t5.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q5 failed: ${e.message}`);
  }

  // 9f. Handoff: explicit invoice request
  try {
    await sendSupportChatMessage(page, "I need an invoice for my accountant. Can you help?", { waitMs: 12000 });
    const t6 = await getSupportChatText(page);
    await shot(page, `${P}-16-chat-invoice-handoff`);
    note(`Chat Q6 (explicit invoice/handoff request) response snippet — note handoff channel mentioned (email/business hours/Brussels time vs WhatsApp etc): ${t6.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q6 failed: ${e.message}`);
  }

  // 9g. Tone/precision check
  try {
    await sendSupportChatMessage(page, "Exactly what date will my card be charged if I upgrade to Premium today?", { waitMs: 12000 });
    const t7 = await getSupportChatText(page);
    await shot(page, `${P}-17-chat-charge-date`);
    note(`Chat Q7 (precise charge-date question, tone/precision check) response snippet: ${t7.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q7 failed: ${e.message}`);
  }
} finally {
  await browser.close();
}

console.log("\n\n=== ALL FINDINGS (persona06) ===\n");
console.log(findings.join("\n\n---\n\n"));
