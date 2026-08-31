// Persona 8: Power user managing multiple companies. Tests multi-account /
// multi-company-profile support, bulk actions on the "Marchés"/My Tenders
// pipeline board, and whether the dashboard scales well with lots of tracked
// activity. Shares the pro_startup session with a parallel "startup founder"
// persona test — pre-existing state we didn't create is noted, not assumed
// to be a bug.
import { writeFileSync } from "node:fs";
import { launchPersona, goto, shot, openSupportChat, sendSupportChatMessage, getSupportChatText, waitForMatchFiltering, log } from "./qa-lib.mjs";

const P = "persona08";
const findings = [];

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

const { browser, context, page } = await launchPersona("pro_startup", {
  headless: true,
  viewport: { width: 1440, height: 900 },
});

let multiCompanySupportFound = false;

try {
  // ===== 1. Mon profil — look for multi-company / account-switching support =====
  try {
    await goto(page, "/profile");
    await shot(page, `${P}-01-profile-initial`);
    let profText = await page.locator("body").innerText();
    note(`/profile loaded. URL: ${page.url()}. Snippet: ${profText.slice(0, 200).replace(/\s+/g, " ")}`);
    if (/404|not found/i.test(profText.slice(0, 200))) {
      await goto(page, "/company");
      await shot(page, `${P}-01b-profile-company-route`);
      profText = await page.locator("body").innerText();
      note(`Fell back to /company. Snippet: ${profText.slice(0, 200).replace(/\s+/g, " ")}`);
    }
  } catch (e) {
    note(`Profile page navigation failed: ${e.message}`);
  }

  const profileFullText = await page.locator("body").innerText();
  note(`Full profile page text: ${profileFullText.replace(/\s+/g, " ").slice(0, 2500)}`);

  // Look for explicit multi-company affordances
  const addCompanyCandidates = page.getByRole("button", { name: /add (a )?(second |new |another )?compan(y|ies)|switch compan|new organi[sz]ation|add organi[sz]ation/i });
  const addCompanyCount = await addCompanyCandidates.count();
  const companySwitcherLinks = page.locator("a, button, select, [role='button']").filter({ hasText: /switch compan|change compan|manage compan(y|ies)/i });
  const switcherCount = await companySwitcherLinks.count();
  note(`"Add company" style buttons found: ${addCompanyCount}. Company-switcher elements found: ${switcherCount}.`);

  if (addCompanyCount > 0) {
    multiCompanySupportFound = true;
    note("Attempting to click the 'add company' affordance to explore the flow.");
    try {
      await addCompanyCandidates.first().click({ timeout: 8000 });
      await page.waitForTimeout(1500);
      await shot(page, `${P}-02-add-company-flow`);
      const flowText = await page.locator("body").innerText();
      note(`After clicking add-company affordance. URL: ${page.url()}. Snippet: ${flowText.slice(0, 1000).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Clicking add-company affordance failed: ${e.message}`);
    }
  } else if (switcherCount > 0) {
    multiCompanySupportFound = true;
    note("Found a company-switcher element but no explicit 'add company' button — investigating.");
    try {
      await companySwitcherLinks.first().click({ timeout: 8000 });
      await page.waitForTimeout(1500);
      await shot(page, `${P}-02-company-switcher-flow`);
      const flowText = await page.locator("body").innerText();
      note(`After clicking company-switcher element. Snippet: ${flowText.slice(0, 1000).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Clicking company-switcher failed: ${e.message}`);
    }
  } else {
    note("GAP: No multi-company / account-switching UI found anywhere on the profile page. Feature appears to not exist.");
  }

  // Also check nav/header for any account/org switcher (common power-user pattern)
  const headerSwitcher = page.locator("header, nav").locator("button, [role='button']").filter({ hasText: /compan|organi[sz]ation|account/i });
  const headerSwitcherCount = await headerSwitcher.count();
  note(`Header/nav account or company switcher candidates: ${headerSwitcherCount}.`);

  // ===== 2. Opportunities: track several tenders (incl. reference tenders) =====
  await goto(page, "/opportunities");
  await shot(page, `${P}-03-opportunities-initial`);
  await waitForMatchFiltering(page);
  await shot(page, `${P}-04-opportunities-settled`);
  const oppsText = await page.locator("body").innerText();
  note(`Opportunities feed snippet (profile-based matches): ${oppsText.slice(0, 1500).replace(/\s+/g, " ")}`);

  const refTenders = ["597390-2026", "597651-2026", "598497-2026"];
  let trackedCount = 0;

  // Track the 3 reference tenders directly via their detail pages (reliable
  // regardless of whether they appear in the current Opportunities feed).
  for (const id of refTenders) {
    try {
      await goto(page, `/tenders/${id}`);
      await page.waitForTimeout(800);
      const trackBtn = page.getByRole("button", { name: /Ajouter au suivi|Add to tracking|Suivre|Track/i }).first();
      const alreadyTracked = page.getByRole("button", { name: /Suivi ajouté|Tracking added|Retirer du suivi|Remove from tracking|Suivi|Tracked/i }).first();
      if (await trackBtn.count()) {
        await trackBtn.click({ timeout: 8000 });
        await page.waitForTimeout(1200);
        trackedCount++;
        note(`Tracked reference tender ${id} via detail page.`);
      } else if (await alreadyTracked.count()) {
        note(`Reference tender ${id} appears already tracked (likely from parallel persona run sharing this session).`);
        trackedCount++;
      } else {
        note(`Could not find a track/add-to-follow-up button on tender ${id} detail page.`);
      }
      await shot(page, `${P}-05-tender-${id}-detail`);
    } catch (e) {
      note(`Tracking tender ${id} failed: ${e.message}`);
    }
  }

  // Track a couple more tenders directly from the Opportunities list (to get
  // to 4-5 tracked total) by clicking "Ajouter au suivi" on list cards.
  try {
    await goto(page, "/opportunities");
    await waitForMatchFiltering(page);
    const listTrackButtons = page.getByRole("button", { name: /Ajouter au suivi|Add to tracking/i });
    const availableCount = await listTrackButtons.count();
    note(`Found ${availableCount} untracked "Add to tracking" buttons on the Opportunities list.`);
    const toClick = Math.min(2, availableCount);
    for (let i = 0; i < toClick; i++) {
      try {
        await listTrackButtons.nth(0).click({ timeout: 8000 }); // list re-renders after each click, so keep grabbing index 0
        await page.waitForTimeout(1200);
        trackedCount++;
        note(`Tracked an additional opportunity from the list (click #${i + 1}).`);
      } catch (e) {
        note(`Failed to track additional opportunity #${i + 1}: ${e.message}`);
      }
    }
    await shot(page, `${P}-06-opportunities-after-tracking`);
  } catch (e) {
    note(`Tracking additional opportunities from list failed: ${e.message}`);
  }

  note(`Total tenders tracked (or confirmed already tracked) this run: ${trackedCount}.`);

  // ===== 3. Marchés / My Tenders — pipeline board scale test =====
  let pipelineFound = false;
  for (const path of ["/tenders/pipeline", "/pipeline", "/my-tenders", "/marches", "/tracked"]) {
    try {
      await goto(page, path);
      const t = await page.locator("body").innerText();
      if (!/404|not found|page introuvable/i.test(t.slice(0, 300))) {
        note(`Found pipeline-ish page at ${path} -> resolved ${page.url()}`);
      }
    } catch (e) {
      // ignore
    }
  }
  // Prefer navigating via the actual nav link (more reliable than guessing routes)
  await goto(page, "/");
  const pipelineNavLink = page.getByRole("link", { name: /Marchés|My Tenders/i }).first();
  if (await pipelineNavLink.count()) {
    try {
      await pipelineNavLink.click({ timeout: 8000 });
      await page.waitForTimeout(1500);
      pipelineFound = true;
      note(`Navigated to pipeline board via nav link. URL: ${page.url()}`);
    } catch (e) {
      note(`Clicking Marchés/My Tenders nav link failed: ${e.message}`);
    }
  } else {
    note("No 'Marchés'/'My Tenders' nav link found in header.");
  }

  if (pipelineFound) {
    await shot(page, `${P}-07-pipeline-board`);
    const pipelineText = await page.locator("body").innerText();
    note(`Pipeline board full text: ${pipelineText.replace(/\s+/g, " ").slice(0, 3000)}`);

    // Count visible tender cards/rows on the board
    const cardCount = await page.locator("[class*='card'], [data-testid*='card'], article").count();
    note(`Approx. card/row elements detected on pipeline board: ${cardCount}`);

    // Look for bulk-action affordances: checkboxes, "select all", bulk status dropdown
    const checkboxes = await page.locator("input[type='checkbox']").count();
    const selectAllBtn = page.getByRole("button", { name: /select all|tout sélectionner/i });
    const selectAllCount = await selectAllBtn.count();
    const bulkActionBtn = page.getByRole("button", { name: /bulk|en masse|groupé/i });
    const bulkActionCount = await bulkActionBtn.count();
    note(`Checkboxes on board: ${checkboxes}. "Select all" affordance: ${selectAllCount}. Explicit bulk-action button: ${bulkActionCount}.`);

    // Look for drag-and-drop hints (draggable attributes) between stages
    const draggableCount = await page.locator("[draggable='true']").count();
    note(`Elements with draggable=true (drag-and-drop pipeline support): ${draggableCount}.`);

    // Look for column/stage headers (kanban-style pipeline)
    const stageHeaders = await page.locator("h2, h3, [class*='column-header'], [class*='stage']").allInnerTexts();
    note(`Possible pipeline stage/column headers found: ${JSON.stringify(stageHeaders.slice(0, 15))}`);

    // Look for per-item status dropdowns/selects (individual, not bulk)
    const statusSelects = await page.locator("select").count();
    note(`<select> elements on board (likely per-item status changers): ${statusSelects}`);

    // Try changing one tender's status via a per-item control, if present, to
    // see how the interaction feels (not a bulk action, but informative).
    if (statusSelects > 0) {
      try {
        const firstSelect = page.locator("select").first();
        const options = await firstSelect.locator("option").allTextContents();
        note(`First status select options: ${JSON.stringify(options)}`);
      } catch (e) {
        note(`Reading status select options failed: ${e.message}`);
      }
    }

    // Sorting/filtering on the board
    const filterInputs = await page.locator("input[type='search'], input[placeholder*='ilter' i], input[placeholder*='echerch' i]").count();
    const sortControls = page.locator("button, select").filter({ hasText: /sort|trier/i });
    const sortCount = await sortControls.count();
    note(`Filter inputs on pipeline board: ${filterInputs}. Sort controls: ${sortCount}.`);

    note(`SCALE ASSESSMENT: board shows ~${cardCount} card-like elements after tracking ~${trackedCount} tenders this session (plus any pre-existing tracked items from the shared session). ` +
      `Bulk status-change UI ${bulkActionCount > 0 || selectAllCount > 0 ? "appears present" : "NOT found"}. Drag-and-drop ${draggableCount > 0 ? "appears present" : "NOT found"}.`);
  } else {
    note("GAP: Could not reach a 'Marchés'/'My Tenders' pipeline board at all via nav or guessed routes.");
  }

  // ===== 4. Suivi / Follow-up page =====
  await goto(page, "/");
  const followUpLink = page.getByRole("link", { name: /Suivi|Follow-up|Follow up/i }).first();
  if (await followUpLink.count()) {
    try {
      await followUpLink.click({ timeout: 8000 });
      await page.waitForTimeout(1500);
      await shot(page, `${P}-08-followup-page`);
      const t = await page.locator("body").innerText();
      note(`Suivi/Follow-up page (${page.url()}) text: ${t.replace(/\s+/g, " ").slice(0, 1800)}`);
    } catch (e) {
      note(`Follow-up nav click failed: ${e.message}`);
    }
  } else {
    note("No 'Suivi'/'Follow-up' nav link found (may be merged into the pipeline board under a different label).");
  }

  // ===== 5. Prévisions / Forecasts page =====
  await goto(page, "/");
  const forecastsLink = page.getByRole("link", { name: /Prévisions|Forecasts/i }).first();
  if (await forecastsLink.count()) {
    try {
      await forecastsLink.click({ timeout: 8000 });
      await page.waitForTimeout(1500);
      await shot(page, `${P}-09-forecasts-page`);
      const t = await page.locator("body").innerText();
      note(`Prévisions/Forecasts page (${page.url()}) text: ${t.replace(/\s+/g, " ").slice(0, 1800)}`);
      const thin = t.replace(/\s+/g, " ").trim().length < 400;
      note(`Forecasts page looks thin/placeholder-ish (text length < 400 chars): ${thin}`);
    } catch (e) {
      note(`Forecasts nav click failed: ${e.message}`);
    }
  } else {
    note("No 'Prévisions'/'Forecasts' nav link found.");
  }

  // ===== 6. Pricing / Premium checkout (view only, stop before payment) =====
  try {
    await goto(page, "/pricing");
    await shot(page, `${P}-10-pricing-top`);
    const pricingText = await page.locator("body").innerText();
    note(`Pricing page full text: ${pricingText.replace(/\s+/g, " ").slice(0, 3000)}`);

    const premiumBtn = page.getByRole("button", { name: /Premium/i }).first();
    const premiumBtnByContainer = page.locator("*").filter({ hasText: /Premium/i }).getByRole("button", { name: /Subscribe|S'abonner|Get started|Upgrade|Choose|Choisir/i }).first();
    let clicked = false;
    if (await premiumBtn.count()) {
      await premiumBtn.click({ timeout: 8000 }).catch(() => {});
      clicked = true;
    } else if (await premiumBtnByContainer.count()) {
      await premiumBtnByContainer.click({ timeout: 8000 }).catch(() => {});
      clicked = true;
    } else {
      // fall back to last subscribe-like button (often the highest tier)
      const subscribeBtns = page.getByRole("button", { name: /Subscribe|S'abonner|Get started|Upgrade|Choose|Choisir/i });
      const n = await subscribeBtns.count();
      note(`Fallback: found ${n} generic subscribe buttons on pricing page.`);
      if (n > 0) {
        await subscribeBtns.last().click({ timeout: 8000 }).catch(() => {});
        clicked = true;
      }
    }
    await page.waitForTimeout(4000);
    await shot(page, `${P}-11-checkout-attempt`);
    note(`Attempted to start Premium checkout, clicked=${clicked}.`);

    const paddleVisible = await page.locator("iframe[src*='paddle'], iframe[name*='paddle']").count();
    note(`Paddle checkout iframe(s) detected: ${paddleVisible}`);
    if (paddleVisible > 0) {
      await page.waitForTimeout(2000);
      await shot(page, `${P}-12-paddle-checkout`);
      note("Screenshotted Paddle checkout overlay. STOPPED before any payment confirmation, per hard safety rules.");
    }
  } catch (e) {
    note(`Pricing/checkout flow failed: ${e.message}`);
  }

  // ===== 7. Support chat — accuracy, multi-company claim check, relevance, hallucination, tone, handoff =====
  await goto(page, "/");
  try {
    await openSupportChat(page);
    await shot(page, `${P}-13-chat-open`);
  } catch (e) {
    note(`Opening support chat failed: ${e.message}`);
  }

  // Accuracy check
  try {
    await sendSupportChatMessage(page, "What is the deadline for tender 597390-2026?", { waitMs: 13000 });
    const t1 = await getSupportChatText(page);
    await shot(page, `${P}-14-chat-accuracy`);
    note(`Chat Q1 (accuracy, deadline 597390-2026; ground truth = 30 Sept 2026) response snippet: ${t1.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q1 (accuracy) failed: ${e.message}`);
  }

  // Multi-company claim check — this is the key persona-specific check
  try {
    await sendSupportChatMessage(page, "Can I manage multiple companies under one account?", { waitMs: 13000 });
    const t2 = await getSupportChatText(page);
    await shot(page, `${P}-15-chat-multi-company`);
    note(`Chat Q2 (multi-company support claim) response snippet: ${t2.slice(-1500).replace(/\s+/g, " ")}`);
    note(`Cross-check vs. actual product: multiCompanySupportFound in UI = ${multiCompanySupportFound}. Compare this against the chat's claim above for a mismatch.`);
  } catch (e) {
    note(`Support chat Q2 (multi-company) failed: ${e.message}`);
  }

  // Relevance check — profile
  try {
    await goto(page, "/profile").catch(() => goto(page, "/company"));
    const profSnippet = (await page.locator("body").innerText()).slice(0, 800).replace(/\s+/g, " ");
    note(`Account profile snippet (for relevance judgment): ${profSnippet}`);
  } catch (e) {
    note(`Re-checking profile for relevance context failed: ${e.message}`);
  }
  await goto(page, "/");
  try {
    await openSupportChat(page);
  } catch (e) { /* likely already open state lost on nav; ignore */ }

  // Hallucination check - fake Enterprise/multi-seat plan
  try {
    await sendSupportChatMessage(page, "Do you have an Enterprise plan with multi-seat/team access for managing 10+ company profiles?", { waitMs: 13000 });
    const t3 = await getSupportChatText(page);
    await shot(page, `${P}-16-chat-fake-enterprise-plan`);
    note(`Chat Q3 (hallucination, fake Enterprise/multi-seat plan) response snippet: ${t3.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q3 (fake plan) failed: ${e.message}`);
  }

  // Hallucination check - non-existent tender
  try {
    await sendSupportChatMessage(page, "Can you give me details on tender 999999-2099?", { waitMs: 13000 });
    const t4 = await getSupportChatText(page);
    await shot(page, `${P}-17-chat-fake-tender`);
    note(`Chat Q4 (hallucination, fake tender ID) response snippet: ${t4.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q4 (fake tender) failed: ${e.message}`);
  }

  // Tone/persona fit - power user, high volume
  try {
    await sendSupportChatMessage(page, "I'm tracking 40+ tenders across several business units. What's the fastest way to bulk-update their status?", { waitMs: 13000 });
    const t5 = await getSupportChatText(page);
    await shot(page, `${P}-18-chat-tone-bulk`);
    note(`Chat Q5 (tone/persona fit, bulk workflow question) response snippet: ${t5.slice(-1500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q5 (tone) failed: ${e.message}`);
  }

  // Handoff check - explicit human help
  try {
    await sendSupportChatMessage(page, "I need to speak with a human about setting up accounts for multiple business units. How do I reach a real person?", { waitMs: 13000 });
    const t6 = await getSupportChatText(page);
    await shot(page, `${P}-19-chat-human-handoff`);
    note(`Chat Q6 (handoff, explicit human request) response snippet: ${t6.slice(-1500).replace(/\s+/g, " ")}`);
    const mentionsWhatsapp = /whatsapp/i.test(t6.slice(-1500));
    const mentionsEmail = /email|e-mail|@tenderproc/i.test(t6.slice(-1500));
    note(`Handoff channel check: mentions WhatsApp=${mentionsWhatsapp}, mentions email=${mentionsEmail}`);
  } catch (e) {
    note(`Support chat Q6 (handoff) failed: ${e.message}`);
  }

} catch (e) {
  note(`FATAL error during run: ${e.stack || e.message}`);
} finally {
  await browser.close();
}

console.log("\n\n=== ALL FINDINGS ===\n");
console.log(findings.join("\n\n---\n\n"));

writeFileSync("test-reports/persona-08-raw-findings.txt", findings.join("\n\n---\n\n"), "utf-8");
