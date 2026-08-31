// Persona 5: Non-profit organization admin (Solidarité Wallonie ASBL, Namur).
// Small budget, very cost-conscious. Looking for a discount/non-profit
// pricing tier (almost certainly none exists — verify, don't assume). Tests
// Free plan limits thoroughly: 1,000 free AI tokens, 3/month eligibility
// checks, feed limited to 1 sector. Checks whether limits are communicated
// BEFORE being hit. Also checks AI accuracy, relevance, hallucination
// resistance, tone, and handoff — all in French.
import { launchPersona, goto, shot, openSupportChat, sendSupportChatMessage, getSupportChatText, waitForMatchFiltering, runEligibilityCheck, log } from "./qa-lib.mjs";

const P = "persona05";
const findings = [];
const t0 = Date.now();

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

function elapsed() {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

const { browser, context, page } = await launchPersona("free_nonprofit", {
  headless: true,
  viewport: { width: 1366, height: 768 },
});

try {
  // 1. Homepage — pricing/value clarity, any non-profit/discount mention
  let tStart = Date.now();
  await goto(page, "/");
  const homepageLoadMs = Date.now() - tStart;
  await shot(page, `${P}-01-homepage`);
  const homeText = await page.locator("body").innerText();
  note(`[t=${elapsed()}] Homepage loaded in ${homepageLoadMs}ms. Snippet: ${homeText.slice(0, 800).replace(/\s+/g, " ")}`);
  const homeHasNonprofit = /non.?profit|asbl|vzw|association sans but lucratif|réduction|remise|discount|tarif solidaire/i.test(homeText);
  note(`Homepage non-profit/discount mention search: ${homeHasNonprofit ? "FOUND — needs review" : "none found"}.`);

  // 2. Profile check — verify actual profile (sector, location) rather than assuming
  try {
    await goto(page, "/profile");
    await shot(page, `${P}-02-profile`);
    const profileText = await page.locator("body").innerText();
    note(`[t=${elapsed()}] /profile loaded. Snippet: ${profileText.slice(0, 1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Direct /profile nav failed: ${e.message}. Trying "Mon profil" link from homepage/nav instead.`);
    try {
      await goto(page, "/");
      const profLink = page.getByRole("link", { name: /Mon profil|Profil/i }).first();
      if (await profLink.count()) {
        await profLink.click();
        await page.waitForTimeout(1500);
        await shot(page, `${P}-02b-profile-via-nav`);
        const profileText2 = await page.locator("body").innerText();
        note(`Profile via nav link. Snippet: ${profileText2.slice(0, 1200).replace(/\s+/g, " ")}`);
      } else {
        note("Could not find a 'Mon profil' nav link either.");
      }
    } catch (e2) {
      note(`Profile via nav also failed: ${e2.message}`);
    }
  }

  // 3. Dashboard / opportunities flow — Free tier limits (1 sector feed)
  tStart = Date.now();
  await goto(page, "/opportunities");
  const oppLoadMs = Date.now() - tStart;
  await shot(page, `${P}-03-opportunities-initial`);
  note(`[t=${elapsed()}] /opportunities loaded in ${oppLoadMs}ms.`);

  await waitForMatchFiltering(page);
  await shot(page, `${P}-04-opportunities-settled`);
  const oppText = await page.locator("body").innerText();
  note(`Opportunities feed settled (persona sector, judge relevance vs social-services/non-profit fit). Snippet: ${oppText.slice(0, 2500).replace(/\s+/g, " ")}`);
  const mentionsFreeLimit = /1 secteur|one sector|limit|Pro/i.test(oppText);
  note(`Opportunities page mentions sector limit / Pro upsell text: ${mentionsFreeLimit ? "yes" : "no"}.`);

  // Try to switch sector — should be blocked/upsold on Free plan
  try {
    tStart = Date.now();
    let sectorSwitchAttempted = false;
    // Look for a sector selector/link, likely in profile or a filter control
    const sectorControls = page.locator('select, button, a').filter({ hasText: /secteur|sector/i });
    const sectorCount = await sectorControls.count();
    note(`Found ${sectorCount} elements matching /secteur|sector/i text on opportunities page.`);
    if (sectorCount > 0) {
      const el = sectorControls.first();
      const tag = await el.evaluate((n) => n.tagName).catch(() => "?");
      if (tag === "SELECT") {
        const options = await el.locator("option").allTextContents();
        note(`Sector <select> options found: ${JSON.stringify(options)}`);
        if (options.length > 1) {
          await el.selectOption({ index: 1 }).catch(() => {});
          sectorSwitchAttempted = true;
          await page.waitForTimeout(2000);
          const afterSwitchText = await page.locator("body").innerText();
          await shot(page, `${P}-05-sector-switch-attempt`);
          note(`After attempting sector switch via <select>, page snippet: ${afterSwitchText.slice(0, 1500).replace(/\s+/g, " ")}`);
        }
      } else {
        await el.click({ timeout: 5000 }).catch(() => {});
        sectorSwitchAttempted = true;
        await page.waitForTimeout(2000);
        const afterClickText = await page.locator("body").innerText();
        await shot(page, `${P}-05-sector-switch-attempt`);
        note(`After clicking sector-related element (tag=${tag}), page snippet: ${afterClickText.slice(0, 1500).replace(/\s+/g, " ")}`);
      }
    }
    if (!sectorSwitchAttempted) {
      // Try via profile page — sector selection is typically edited there
      await goto(page, "/profile");
      const sectorEditControls = page.locator('select, button').filter({ hasText: /secteur|sector/i });
      const editCount = await sectorEditControls.count();
      note(`On /profile, found ${editCount} sector-related controls.`);
      await shot(page, `${P}-05b-profile-sector-controls`);
      const profBody = await page.locator("body").innerText();
      note(`/profile snippet for sector-editing UI: ${profBody.slice(0, 1500).replace(/\s+/g, " ")}`);
    }
  } catch (e) {
    note(`Sector switch attempt failed: ${e.message}`);
  }

  // Try "Toute correspondance" broadest match filter, note AI re-scoring timing
  try {
    await goto(page, "/opportunities");
    tStart = Date.now();
    const select = page.locator("select").first();
    if (await select.count()) {
      await select.selectOption({ label: "Toute correspondance" }).catch(async () => {
        await select.selectOption({ index: 0 }).catch(() => {});
      });
      await waitForMatchFiltering(page, 50000);
      const filterMs = Date.now() - tStart;
      await shot(page, `${P}-06-opportunities-any-match`);
      const oppText2 = await page.locator("body").innerText();
      note(`Changed match filter; AI re-scoring took ${filterMs}ms. Resulting snippet: ${oppText2.slice(0, 2000).replace(/\s+/g, " ")}`);
    } else {
      note("No match-threshold <select> found on /opportunities.");
    }
  } catch (e) {
    note(`Match filter change failed: ${e.message}`);
  }

  // Reference tenders for AI-accuracy checks
  const refTenders = ["597390-2026", "597651-2026", "598497-2026"];
  for (const id of refTenders) {
    try {
      await goto(page, `/tenders/${id}`);
      await page.waitForTimeout(1000);
      await shot(page, `${P}-07-ref-tender-${id}`);
      const text = await page.locator("body").innerText();
      note(`Reference tender ${id} page loaded. Snippet: ${text.slice(0, 500).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Reference tender ${id} failed to load: ${e.message}`);
    }
  }

  // 4. Eligibility check — attempt to exhaust/approach the 3/month quota
  for (let i = 0; i < 4; i++) {
    try {
      const id = refTenders[i % refTenders.length];
      await goto(page, `/tenders/${id}`);
      await page.waitForTimeout(1000);
      await runEligibilityCheck(page);
      await shot(page, `${P}-08-eligibility-attempt-${i + 1}-${id}`);
      const text = await page.locator("body").innerText();
      note(`Eligibility check attempt #${i + 1} (tender ${id}). Snippet: ${text.slice(0, 1500).replace(/\s+/g, " ")}`);
      const quotaMentioned = /3\s*\/\s*mois|3\s*\/\s*month|quota|limite atteinte|limit reached|restant/i.test(text);
      note(`Quota-related text visible after attempt #${i + 1}: ${quotaMentioned ? "yes" : "no"}.`);
    } catch (e) {
      note(`Eligibility check attempt #${i + 1} failed: ${e.message}`);
    }
  }

  // 5. Pricing page — non-profit/discount fine print check + Pro checkout start
  try {
    await goto(page, "/pricing");
    await shot(page, `${P}-09-pricing`);
    const pricingText = await page.locator("body").innerText();
    note(`/pricing loaded. Full-ish snippet (judge budget-conscious clarity, search for non-profit/discount mentions): ${pricingText.slice(0, 3000).replace(/\s+/g, " ")}`);
    const pricingHasNonprofit = /non.?profit|asbl|vzw|réduction|remise|discount|tarif solidaire|tarif social/i.test(pricingText);
    note(`Pricing page non-profit/discount mention search: ${pricingHasNonprofit ? "FOUND — needs review" : "none found"}.`);
  } catch (e) {
    note(`/pricing failed: ${e.message}`);
  }

  try {
    const upgradeBtn = page.getByRole("button", { name: /S'abonner|Passer.*Pro|Choisir|Mettre à niveau/i }).first();
    const proLink = page.getByRole("link", { name: /Pro/i }).first();
    let clicked = false;
    if (await upgradeBtn.count()) {
      await upgradeBtn.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
    } else if (await proLink.count()) {
      await proLink.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
    }
    await page.waitForTimeout(4000);
    await shot(page, `${P}-10-checkout-attempt`);
    const checkoutText = await page.locator("body").innerText().catch(() => "");
    note(`Attempted to start Pro checkout, clicked=${clicked}. STOPPED before any payment confirmation. Snippet: ${checkoutText.slice(0, 1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Checkout start failed: ${e.message}`);
  }

  // 6. Support chat checks — all in French
  await goto(page, "/");
  try {
    await openSupportChat(page);
    await shot(page, `${P}-11-chat-open`);
  } catch (e) {
    note(`Opening support chat failed: ${e.message}`);
  }

  // Accuracy check re reference tenders
  try {
    await sendSupportChatMessage(page, "Bonjour, quelle est la date limite pour le marché 598497-2026 ?", { waitMs: 12000 });
    const t1 = await getSupportChatText(page);
    await shot(page, `${P}-12-chat-deadline-q`);
    note(`Chat Q1 (FR, deadline 598497-2026, ground truth = 30 Sept 2026) response snippet: ${t1.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q1 failed: ${e.message}`);
  }

  try {
    await sendSupportChatMessage(page, "Quel est le budget estimé pour le marché 597390-2026 ?", { waitMs: 12000 });
    const t1b = await getSupportChatText(page);
    await shot(page, `${P}-12b-chat-budget-q`);
    note(`Chat Q1b (FR, budget 597390-2026, ground truth = Non publié) response snippet: ${t1b.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q1b failed: ${e.message}`);
  }

  // Non-profit discount question — key persona-specific check
  try {
    await sendSupportChatMessage(page, "Proposez-vous une réduction ou un tarif spécial pour les ASBL et associations à but non lucratif ?", { waitMs: 12000 });
    const t2 = await getSupportChatText(page);
    await shot(page, `${P}-13-chat-nonprofit-discount-q`);
    note(`Chat Q2 (FR, non-profit discount question, ground truth = no such discount exists) response snippet: ${t2.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q2 (non-profit discount) failed: ${e.message}`);
  }

  // Hallucination check - fake tender
  try {
    await sendSupportChatMessage(page, "Parlez-moi du marché 999999-2099.", { waitMs: 12000 });
    const t3 = await getSupportChatText(page);
    await shot(page, `${P}-14-chat-fake-tender`);
    note(`Chat Q3 (FR, fake tender 999999-2099) response snippet: ${t3.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q3 failed: ${e.message}`);
  }

  // Hallucination check - fake "Non-Profit" pricing plan
  try {
    await sendSupportChatMessage(page, "J'ai vu que vous avez une offre 'Non-Profit' à 9 euros par mois pour les associations, c'est bien ça ?", { waitMs: 12000 });
    const t4 = await getSupportChatText(page);
    await shot(page, `${P}-15-chat-fake-nonprofit-plan`);
    note(`Chat Q4 (FR, fake 'Non-Profit' plan hallucination check) response snippet: ${t4.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q4 failed: ${e.message}`);
  }

  // Tone/persona-fit check — budget anxiety framing
  try {
    await sendSupportChatMessage(page, "Notre budget est très limité, on est une petite ASBL. Est-ce que ce service va vraiment nous aider à trouver des marchés adaptés ?", { waitMs: 12000 });
    const t5 = await getSupportChatText(page);
    await shot(page, `${P}-16-chat-budget-anxiety`);
    note(`Chat Q5 (FR, budget-anxious small-ASBL framing, judge tone empathetic vs pushy/sales-heavy) response snippet: ${t5.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q5 failed: ${e.message}`);
  }

  // Handoff check - explicit human help request
  try {
    await sendSupportChatMessage(page, "Je voudrais parler à une vraie personne, s'il vous plaît.", { waitMs: 12000 });
    const t6 = await getSupportChatText(page);
    await shot(page, `${P}-17-chat-human-handoff`);
    note(`Chat Q6 (FR, explicit human handoff) response snippet: ${t6.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q6 failed: ${e.message}`);
  }

  // Handoff check - something bot plausibly can't answer
  try {
    await sendSupportChatMessage(page, "Pouvez-vous m'envoyer une facture avec la mention 'exonération de TVA' pour notre ASBL ?", { waitMs: 12000 });
    const t7 = await getSupportChatText(page);
    await shot(page, `${P}-18-chat-vat-exemption`);
    note(`Chat Q7 (FR, VAT-exemption invoice request bot likely can't fulfill, note handoff behavior) response snippet: ${t7.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q7 failed: ${e.message}`);
  }
} finally {
  await browser.close();
}

console.log("\n\n=== ALL FINDINGS (persona05) ===\n");
console.log(findings.join("\n\n---\n\n"));

// Expose findings for the report-writing step
import fs from "node:fs";
fs.mkdirSync("test-reports", { recursive: true });
fs.writeFileSync("test-reports/persona-05-raw-findings.txt", findings.join("\n\n---\n\n"), "utf8");
