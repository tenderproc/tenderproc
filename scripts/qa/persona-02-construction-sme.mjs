// Persona 2: Family-run construction SME, Wallonia. Older owner, non-native
// French speaker, low digital literacy, slow rural connection. Tests
// homepage clarity, dashboard/opportunities flow, construction-sector match
// relevance, tender detail pages, pricing/checkout (stop before pay), and
// support chat (accuracy, relevance, hallucination, tone/persona-fit,
// handoff) — all in French.
import { launchPersona, goto, shot, openSupportChat, sendSupportChatMessage, getSupportChatText, waitForMatchFiltering, runEligibilityCheck, log } from "./qa-lib.mjs";

const P = "persona02";
const findings = [];
const t0 = Date.now();

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

function elapsed() {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

const { browser, context, page } = await launchPersona("free_construction_sme", {
  headless: true,
  viewport: { width: 1366, height: 768 },
});

// Rough "bad rural DSL/3G" throttling via CDP.
let throttled = false;
try {
  const client = await context.newCDPSession(page);
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (200 * 1024) / 8,
    latency: 400,
  });
  throttled = true;
  note("Network throttling applied via CDP: ~400kbps down / 200kbps up / 400ms latency.");
} catch (e) {
  note(`Network throttling via CDP failed (${e.message}); evaluating as-if-slow-connection instead, without actual throttling.`);
}

try {
  // 1. Homepage cold landing — value prop clarity, load time under throttling
  let tStart = Date.now();
  await goto(page, "/");
  const homepageLoadMs = Date.now() - tStart;
  await shot(page, `${P}-01-homepage`);
  const homeText = await page.locator("body").innerText();
  note(`[t=${elapsed()}] Homepage loaded in ${homepageLoadMs}ms (throttled=${throttled}). Visible text snippet: ${homeText.slice(0, 500).replace(/\s+/g, " ")}`);

  // 2. Profile check — verify actual profile rather than assuming
  try {
    await goto(page, "/profile");
    await shot(page, `${P}-02-profile`);
    const profileText = await page.locator("body").innerText();
    note(`[t=${elapsed()}] /profile loaded. Snippet: ${profileText.slice(0, 800).replace(/\s+/g, " ")}`);
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
        note(`Profile via nav link. Snippet: ${profileText2.slice(0, 800).replace(/\s+/g, " ")}`);
      } else {
        note("Could not find a 'Mon profil' nav link either.");
      }
    } catch (e2) {
      note(`Profile via nav also failed: ${e2.message}`);
    }
  }

  // 3. Dashboard / opportunities flow
  tStart = Date.now();
  await goto(page, "/opportunities");
  const oppLoadMs = Date.now() - tStart;
  await shot(page, `${P}-03-opportunities-initial`);
  note(`[t=${elapsed()}] /opportunities loaded in ${oppLoadMs}ms.`);

  await waitForMatchFiltering(page);
  await shot(page, `${P}-04-opportunities-settled`);
  const oppText = await page.locator("body").innerText();
  note(`Opportunities feed settled. Snippet (for construction-sector relevance judgment): ${oppText.slice(0, 2500).replace(/\s+/g, " ")}`);

  // Try "Toute correspondance" / broadest filter to see full candidate set, note timing
  try {
    tStart = Date.now();
    const select = page.locator("select").first();
    if (await select.count()) {
      await select.selectOption({ label: "Toute correspondance" }).catch(async () => {
        await select.selectOption({ index: 0 }).catch(() => {});
      });
      await waitForMatchFiltering(page, 50000);
      const filterMs = Date.now() - tStart;
      await shot(page, `${P}-05-opportunities-any-match`);
      const oppText2 = await page.locator("body").innerText();
      note(`Changed match filter; AI re-scoring took ${filterMs}ms. Resulting snippet: ${oppText2.slice(0, 2500).replace(/\s+/g, " ")}`);
    } else {
      note("No match-threshold <select> found on /opportunities — could not test AI re-scoring filter.");
    }
  } catch (e) {
    note(`Match filter change failed: ${e.message}`);
  }

  // Open 2-3 tender details from the opportunities feed (construction-relevant, persona's own matches)
  try {
    const tenderLinks = page.locator('a[href*="/tenders/"]');
    const count = await tenderLinks.count();
    note(`Found ${count} tender links on opportunities page.`);
    const hrefs = [];
    for (let i = 0; i < Math.min(count, 3); i++) {
      const href = await tenderLinks.nth(i).getAttribute("href");
      if (href && !hrefs.includes(href)) hrefs.push(href);
    }
    for (const href of hrefs) {
      try {
        await goto(page, href);
        await page.waitForTimeout(1200);
        await shot(page, `${P}-06-tender-${href.split("/").pop()}`);
        const tText = await page.locator("body").innerText();
        note(`Own-match tender ${href} loaded. Snippet: ${tText.slice(0, 800).replace(/\s+/g, " ")}`);
      } catch (e) {
        note(`Failed to open own-match tender ${href}: ${e.message}`);
      }
    }
  } catch (e) {
    note(`Could not enumerate own-match tender links: ${e.message}`);
  }

  // Reference tenders for AI-accuracy checks (general knowledge, not sector-matched)
  const refTenders = ["597390-2026", "597651-2026"];
  for (const id of refTenders) {
    try {
      await goto(page, `/tenders/${id}`);
      await page.waitForTimeout(1000);
      await shot(page, `${P}-07-ref-tender-${id}`);
      const text = await page.locator("body").innerText();
      note(`Reference tender ${id} page loaded. Snippet: ${text.slice(0, 400).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Reference tender ${id} failed to load: ${e.message}`);
    }
  }

  // Eligibility check on one reference tender
  try {
    await goto(page, `/tenders/${refTenders[0]}`);
    await page.waitForTimeout(1000);
    await runEligibilityCheck(page);
    await shot(page, `${P}-08-eligibility-${refTenders[0]}`);
    const text = await page.locator("body").innerText();
    note(`Eligibility check ran on ${refTenders[0]}. Snippet after check: ${text.slice(0, 1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Eligibility check on ${refTenders[0]} failed: ${e.message}`);
  }

  // 4. Pricing page + Pro checkout start (stop before payment)
  try {
    await goto(page, "/pricing");
    await shot(page, `${P}-09-pricing`);
    const pricingText = await page.locator("body").innerText();
    note(`/pricing loaded. Snippet (judge French clarity for non-expert): ${pricingText.slice(0, 1500).replace(/\s+/g, " ")}`);
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
    note(`Attempted to start Pro checkout, clicked=${clicked}. STOPPED before any payment confirmation. Snippet: ${checkoutText.slice(0, 1000).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Checkout start failed: ${e.message}`);
  }

  // 5. Support chat checks — all in French
  await goto(page, "/");
  try {
    await openSupportChat(page);
    await shot(page, `${P}-11-chat-open`);
  } catch (e) {
    note(`Opening support chat failed: ${e.message}`);
  }

  // Accuracy check re reference tenders (French)
  try {
    await sendSupportChatMessage(page, "Bonjour, quelle est la date limite pour le marché 597390-2026 ?", { waitMs: 12000 });
    const t1 = await getSupportChatText(page);
    await shot(page, `${P}-12-chat-deadline-q`);
    note(`Chat Q1 (FR, deadline 597390-2026, ground truth = 30 Sept 2026) response snippet: ${t1.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q1 failed: ${e.message}`);
  }

  try {
    await sendSupportChatMessage(page, "Quel est le budget estimé pour le marché 597651-2026 ?", { waitMs: 12000 });
    const t1b = await getSupportChatText(page);
    await shot(page, `${P}-12b-chat-budget-q`);
    note(`Chat Q1b (FR, budget 597651-2026, ground truth = Non publié) response snippet: ${t1b.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q1b failed: ${e.message}`);
  }

  // Hallucination check - fake tender
  try {
    await sendSupportChatMessage(page, "Parlez-moi du marché 999999-2099.", { waitMs: 12000 });
    const t2 = await getSupportChatText(page);
    await shot(page, `${P}-13-chat-fake-tender`);
    note(`Chat Q2 (FR, fake tender 999999-2099) response snippet: ${t2.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q2 failed: ${e.message}`);
  }

  // Hallucination check - fake pricing plan
  try {
    await sendSupportChatMessage(page, "Avez-vous une offre 'Artisan' à 15 euros par mois ?", { waitMs: 12000 });
    const t3 = await getSupportChatText(page);
    await shot(page, `${P}-14-chat-fake-plan`);
    note(`Chat Q3 (FR, fake 'Artisan' plan) response snippet: ${t3.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q3 failed: ${e.message}`);
  }

  // Tone/persona-fit check — ask a simple, layperson question to gauge jargon level
  try {
    await sendSupportChatMessage(page, "Je ne comprends pas bien comment utiliser ce site, c'est compliqué pour moi. Pouvez-vous m'expliquer simplement ?", { waitMs: 12000 });
    const t3b = await getSupportChatText(page);
    await shot(page, `${P}-14b-chat-plain-language`);
    note(`Chat Q3b (FR, plain-language/low-literacy request) response snippet: ${t3b.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q3b failed: ${e.message}`);
  }

  // Handoff check - explicit human help request
  try {
    await sendSupportChatMessage(page, "Je voudrais parler à une vraie personne, s'il vous plaît.", { waitMs: 12000 });
    const t4 = await getSupportChatText(page);
    await shot(page, `${P}-15-chat-human-handoff`);
    note(`Chat Q4 (FR, explicit human handoff) response snippet: ${t4.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q4 failed: ${e.message}`);
  }

  // Handoff check - something bot plausibly can't answer
  try {
    await sendSupportChatMessage(page, "Pouvez-vous annuler mon abonnement et me rembourser tout de suite ?", { waitMs: 12000 });
    const t5 = await getSupportChatText(page);
    await shot(page, `${P}-16-chat-cancel-refund`);
    note(`Chat Q5 (FR, cancel/refund request) response snippet: ${t5.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q5 failed: ${e.message}`);
  }
} finally {
  await browser.close();
}

console.log("\n\n=== ALL FINDINGS (persona02) ===\n");
console.log(findings.join("\n\n---\n\n"));
