// Persona 3: Startup founder, Flanders. Bilingual NL/EN, price-sensitive,
// actively comparing TenderProc to competitors. Mobile viewport (Chromium
// emulating an iPhone-ish viewport — true WebKit isn't set up in this repo's
// Playwright config, so this approximates "mobile Safari" via Chromium's
// mobile viewport, NOT real WebKit).
import { launchPersona, goto, shot, waitForMatchFiltering, log } from "./qa-lib.mjs";

// qa-lib's chat helpers only match FR/EN button+placeholder text; the site
// is running in the "nl" locale for this persona (bubbleLabel "Chatondersteuning
// openen", placeholder "Typ uw bericht…" per messages/nl.json), so use
// locale-aware versions here instead of editing the shared lib.
async function openSupportChat(page) {
  const btn = page.getByRole("button", { name: /Ouvrir le chat d'assistance|Open support chat|Chatondersteuning openen/i });
  await btn.click();
  await page.waitForTimeout(800);
}
async function sendSupportChatMessage(page, message, { waitMs = 10000 } = {}) {
  const input = page.getByPlaceholder(/Écrivez votre message|Write your message|Typ uw bericht/i);
  await input.fill(message);
  await input.press("Enter");
  await page.waitForTimeout(waitMs);
}
async function getSupportChatText(page) {
  return page.locator("body").innerText();
}

const P = "persona03";
const findings = [];

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

const MOBILE_VIEWPORT = { width: 390, height: 844 };

const { browser, context, page } = await launchPersona("pro_startup", { headless: true, viewport: MOBILE_VIEWPORT });

try {
  // Set locale to Dutch (Flanders founder) up front via the locale cookie,
  // mirroring what the in-app LocaleSwitcher would do, since clicking a
  // small-screen dropdown reliably is fiddly. We'll also sanity-check the
  // switcher itself is present/usable on mobile.
  await context.addCookies([
    { name: "locale", value: "nl", domain: "www.tenderproc.com", path: "/" },
  ]);

  // 1. Homepage cold landing on mobile, Dutch locale
  await goto(page, "/");
  await shot(page, `${P}-01-homepage-mobile-nl`);
  const homeText = await page.locator("body").innerText();
  note(`Homepage (mobile, NL locale) loaded. Snippet: ${homeText.slice(0, 300).replace(/\s+/g, " ")}`);

  // Check for horizontal overflow (a common mobile responsiveness bug)
  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  note(`Homepage horizontal overflow present: ${hasHorizontalScroll}`);

  // Look for a language switcher on mobile and note whether it's easily tappable
  try {
    const switcherCandidates = page.locator("button, [role='button'], select").filter({ hasText: /NL|EN|FR|DE|Nederlands|English|Français|Deutsch/i });
    const count = await switcherCandidates.count();
    note(`Language switcher candidates found on homepage (mobile): ${count}`);
  } catch (e) {
    note(`Language switcher probe failed: ${e.message}`);
  }

  // 2. Profile check - verify actual profile data (route is /company, not /profile)
  try {
    await goto(page, "/company");
    await shot(page, `${P}-02-profile-company`);
    const profText = await page.locator("body").innerText();
    note(`/company (profile) page loaded (mobile). Snippet: ${profText.slice(0, 600).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`/company profile page failed: ${e.message}`);
  }

  // 3. Dashboard / opportunities on mobile
  await goto(page, "/opportunities");
  await shot(page, `${P}-03-opportunities-initial-mobile`);
  note("Loaded /opportunities (mobile).");
  await waitForMatchFiltering(page);
  await shot(page, `${P}-04-opportunities-settled-mobile`);

  const oppsOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  note(`Opportunities page horizontal overflow present (mobile): ${oppsOverflow}`);

  const oppsText = await page.locator("body").innerText();
  note(`Opportunities feed snippet (mobile, profile-based matches): ${oppsText.slice(0, 1200).replace(/\s+/g, " ")}`);

  // 4. Reference tender detail pages (matching flow + accuracy ground truth)
  const refTenders = ["597390-2026", "597651-2026", "598497-2026"];
  for (const id of refTenders) {
    try {
      await goto(page, `/tenders/${id}`);
      await page.waitForTimeout(1000);
      await shot(page, `${P}-05-tender-${id}-mobile`);
      const text = await page.locator("body").innerText();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      note(`Tender ${id} page loaded (mobile). Horizontal overflow: ${overflow}. Snippet: ${text.slice(0, 400).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Tender ${id} failed to load: ${e.message}`);
    }
  }

  // 5. Pricing page — scrutinize hard as a price-sensitive comparison shopper
  try {
    await goto(page, "/pricing");
    await shot(page, `${P}-06-pricing-mobile-top`);
    const pricingText = await page.locator("body").innerText();
    note(`Pricing page (mobile, NL) full text: ${pricingText.replace(/\s+/g, " ").slice(0, 3000)}`);

    const pricingOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    note(`Pricing page horizontal overflow present (mobile): ${pricingOverflow}`);

    // Scroll down to see all tiers on mobile (likely stacked)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(500);
    await shot(page, `${P}-07-pricing-mobile-mid`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await shot(page, `${P}-08-pricing-mobile-bottom`);
  } catch (e) {
    note(`/pricing failed: ${e.message}`);
  }

  // Start (don't complete) Pro plan checkout on mobile
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const subscribeBtns = page.getByRole("button", { name: /Subscribe|Abonneren|S'abonner|Get started|Aan de slag/i });
    const btnCount = await subscribeBtns.count();
    note(`Found ${btnCount} subscribe/get-started buttons on pricing page (mobile).`);
    let clicked = false;
    if (btnCount > 0) {
      // Prefer the Pro-tier one if we can find it near "Pro" text; else first.
      await subscribeBtns.first().click({ timeout: 8000 }).catch(() => {});
      clicked = true;
    }
    await page.waitForTimeout(4000);
    await shot(page, `${P}-09-checkout-attempt-mobile`);
    note(`Attempted to start Pro checkout on mobile, clicked=${clicked}.`);

    // If a Paddle overlay/iframe opened, screenshot it but do NOT interact
    // with payment fields or click any confirm/pay button.
    const paddleFrame = page.frameLocator("iframe[src*='paddle'], iframe[name*='paddle']").first();
    const paddleVisible = await page.locator("iframe[src*='paddle'], iframe[name*='paddle']").count();
    note(`Paddle checkout iframe(s) detected: ${paddleVisible}`);
    if (paddleVisible > 0) {
      await page.waitForTimeout(2000);
      await shot(page, `${P}-10-paddle-checkout-mobile`);
      note("Screenshotted Paddle checkout overlay on mobile. STOPPED before any payment confirmation, per hard safety rules.");
    }
  } catch (e) {
    note(`Checkout start failed: ${e.message}`);
  }

  // 6. Support chat — accuracy, relevance, hallucination, tone, handoff
  // Switch chat testing to English (persona is bilingual, and English text
  // is easier to grep for regressions across personas) by re-navigating with
  // the locale cookie still set to nl; try to detect actual chat locale.
  await goto(page, "/");
  try {
    await openSupportChat(page);
    await shot(page, `${P}-11-chat-open-mobile`);
  } catch (e) {
    note(`Opening support chat failed: ${e.message}`);
  }

  // Accuracy check - reference tender budget & deadline
  try {
    await sendSupportChatMessage(page, "Wat is het geraamde budget en de deadline voor opdracht 597390-2026?", { waitMs: 13000 });
    const t1 = await getSupportChatText(page);
    await shot(page, `${P}-12-chat-accuracy-mobile`);
    note(`Chat Q1 (accuracy, budget+deadline 597390-2026, NL) response snippet: ${t1.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q1 (accuracy) failed: ${e.message}`);
  }

  // Accuracy check #2 - second reference tender deadline
  try {
    await sendSupportChatMessage(page, "And what's the deadline for tender 597651-2026?", { waitMs: 13000 });
    const t1b = await getSupportChatText(page);
    await shot(page, `${P}-13-chat-accuracy2-mobile`);
    note(`Chat Q1b (accuracy, deadline 597651-2026, EN) response snippet: ${t1b.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q1b (accuracy 2) failed: ${e.message}`);
  }

  // Hallucination check - fake feature (API integration)
  try {
    await sendSupportChatMessage(page, "Do you have an API integration feature I can use to pull tenders into our own system?", { waitMs: 13000 });
    const t2 = await getSupportChatText(page);
    await shot(page, `${P}-14-chat-fake-feature-mobile`);
    note(`Chat Q2 (hallucination, fake API feature) response snippet: ${t2.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q2 (fake feature) failed: ${e.message}`);
  }

  // Hallucination check - fake competitor comparison
  try {
    await sendSupportChatMessage(page, "How does TenderProc compare to Mercell and TenderWolf on pricing and features?", { waitMs: 13000 });
    const t3 = await getSupportChatText(page);
    await shot(page, `${P}-15-chat-competitor-mobile`);
    note(`Chat Q3 (hallucination, competitor comparison) response snippet: ${t3.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q3 (competitor) failed: ${e.message}`);
  }

  // Hallucination check - non-existent tender ID
  try {
    await sendSupportChatMessage(page, "Can you give me details on tender 123456-2099?", { waitMs: 13000 });
    const t4 = await getSupportChatText(page);
    await shot(page, `${P}-16-chat-fake-tender-mobile`);
    note(`Chat Q4 (hallucination, fake tender ID) response snippet: ${t4.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q4 (fake tender) failed: ${e.message}`);
  }

  // Handoff check - explicit human help request
  try {
    await sendSupportChatMessage(page, "I want to talk to a real person about pricing, not a bot.", { waitMs: 13000 });
    const t5 = await getSupportChatText(page);
    await shot(page, `${P}-17-chat-human-handoff-mobile`);
    note(`Chat Q5 (handoff, explicit human request) response snippet: ${t5.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q5 (handoff) failed: ${e.message}`);
  }

  // Handoff check - something bot plausibly can't answer
  try {
    await sendSupportChatMessage(page, "Can you negotiate a custom discount for my startup?", { waitMs: 13000 });
    const t6 = await getSupportChatText(page);
    await shot(page, `${P}-18-chat-cant-answer-mobile`);
    note(`Chat Q6 (handoff, can't-answer request) response snippet: ${t6.slice(-1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q6 (can't-answer) failed: ${e.message}`);
  }

} finally {
  await browser.close();
}

console.log("\n\n=== ALL FINDINGS ===\n");
console.log(findings.join("\n\n---\n\n"));
