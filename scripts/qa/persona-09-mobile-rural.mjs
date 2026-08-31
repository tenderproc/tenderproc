// Persona 9: Mobile-only user, rural area, spotty 4G. Focus: load times,
// responsiveness, and graceful degradation under bad network conditions
// (real CDP network throttling, mobile viewport). Secondary: light AI
// accuracy/hallucination check.
import { launchPersona, goto, shot, waitForMatchFiltering, runEligibilityCheck, log } from "./qa-lib.mjs";

const P = "persona09";
const findings = [];
const t0 = Date.now();

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

function elapsed() {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

async function timeIt(label, fn) {
  const start = Date.now();
  let result, error;
  try {
    result = await fn();
  } catch (e) {
    error = e;
  }
  const ms = Date.now() - start;
  if (error) {
    note(`[TIMING] ${label}: FAILED after ${(ms / 1000).toFixed(1)}s — ${error.message.slice(0, 300)}`);
  } else {
    note(`[TIMING] ${label}: ${(ms / 1000).toFixed(1)}s`);
  }
  return { result, error, ms };
}

const { browser, context, page } = await launchPersona("free_novice", {
  headless: true,
  viewport: { width: 390, height: 844 },
});

let throttleLevel = "harsh (150kbps down / 100kbps up / 600ms RTT)";

try {
  const client = await context.newCDPSession(page);
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (150 * 1024) / 8, // ~150kbps down
    uploadThroughput: (100 * 1024) / 8,
    latency: 600,
  });
  note(`Network throttling applied: ${throttleLevel}`);

  // 1. Homepage cold load timing
  let homepageOk = false;
  {
    const { error, ms } = await timeIt("Homepage cold load (domcontentloaded)", async () => {
      await goto(page, "/");
    });
    homepageOk = !error;
    await shot(page, `${P}-01-homepage`);
  }

  // If homepage totally failed, back off to a less harsh throttle and retry once.
  if (!homepageOk) {
    note("Homepage failed to load under harsh throttle within timeout. Backing off to 400kbps/300ms RTT and retrying.");
    throttleLevel = "backed-off (400kbps down / 300kbps up / 300ms RTT) after harsh throttle made site untestable";
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (300 * 1024) / 8,
      latency: 300,
    });
    const { error } = await timeIt("Homepage cold load retry (backed-off throttle)", async () => {
      await goto(page, "/");
    });
    homepageOk = !error;
    await shot(page, `${P}-01b-homepage-retry`);
    if (!homepageOk) {
      note("[UX] [severity: critical] Homepage failed to load even under backed-off throttle (400kbps/300ms). Full spotty-4G conditions made the site largely untestable — this is itself a critical finding: the site has no usable degraded-network experience.");
    }
  }

  // Mobile responsiveness check on homepage (independent of speed)
  try {
    const bodyBox = await page.locator("body").boundingBox();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const hasHorizScroll = scrollWidth > clientWidth + 5;
    note(`Homepage mobile layout check: viewport clientWidth=${clientWidth}, scrollWidth=${scrollWidth}, horizontalOverflow=${hasHorizScroll}`);
    if (hasHorizScroll) {
      note(`[UX] [severity: major] Homepage has horizontal overflow on 390px mobile viewport (scrollWidth=${scrollWidth} vs clientWidth=${clientWidth}) — content is wider than the screen, forcing horizontal scroll.`);
    }
  } catch (e) {
    note(`Homepage layout measurement failed: ${e.message}`);
  }

  // Check nav usability (hamburger menu presence for one-handed mobile use)
  try {
    const navButtons = await page.getByRole("button").all();
    const navLinks = await page.getByRole("link").all();
    note(`Homepage has ${navButtons.length} buttons and ${navLinks.length} links visible in accessibility tree (mobile nav check).`);
    const menuBtn = page.getByRole("button", { name: /menu|Menu/i }).first();
    const hasMenuBtn = await menuBtn.count();
    note(`Hamburger/menu button found: ${hasMenuBtn > 0}`);
  } catch (e) {
    note(`Nav usability check failed: ${e.message}`);
  }

  // 2. Navigate to dashboard/opportunities — time it, check for loading state mid-load
  await timeIt("Navigation to /opportunities (domcontentloaded)", async () => {
    await goto(page, "/opportunities");
  });
  await shot(page, `${P}-02-opportunities-initial`);

  // Try to catch a loading state mid-load by screenshotting quickly after a fresh nav
  try {
    const navStart = Date.now();
    const navPromise = page.goto(new URL("/opportunities", "https://www.tenderproc.com").toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(800); // grab a mid-flight screenshot
    await shot(page, `${P}-03-opportunities-midload`);
    await navPromise;
    const navMs = Date.now() - navStart;
    note(`[TIMING] Opportunities re-navigation (with mid-load screenshot at 800ms): total ${(navMs / 1000).toFixed(1)}s`);
    const midLoadText = await page.locator("body").innerText().catch(() => "");
    const hasSpinnerIndicator = /loading|chargement|patientez|please wait/i.test(midLoadText);
    note(`Mid-load screenshot text hints at loading indicator present: ${hasSpinnerIndicator}. Snippet: ${midLoadText.slice(0, 300).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Mid-load screenshot capture failed: ${e.message}`);
  }

  await page.waitForTimeout(1500);
  const oppText = await page.locator("body").innerText().catch(() => "");
  note(`Opportunities page settled text snippet: ${oppText.slice(0, 500).replace(/\s+/g, " ")}`);

  // 3. Time the AI match-filtering step specifically
  try {
    const filterStart = Date.now();
    // Trigger a filter change if a select/search control is present
    const select = page.locator("select").first();
    let triggered = false;
    if (await select.count()) {
      await select.selectOption({ index: 0 }).catch(() => {});
      const searchBtn = page.getByRole("button", { name: /Rechercher|Search/i }).first();
      if (await searchBtn.count()) {
        await searchBtn.click().catch(() => {});
        triggered = true;
      }
    }
    await shot(page, `${P}-04-filtering-inflight`);
    const inflightText = await page.locator("body").innerText().catch(() => "");
    const hasFilteringIndicator = /Filtrage par|Filtering|patientez|moment/i.test(inflightText);
    note(`Match-filtering triggered=${triggered}. "May take a moment" / filtering indicator visible right after trigger: ${hasFilteringIndicator}`);
    await waitForMatchFiltering(page, 120000);
    const filterMs = Date.now() - filterStart;
    note(`[TIMING] AI match-filtering (Opportunities) under throttling: ${(filterMs / 1000).toFixed(1)}s (triggered=${triggered})`);
    await shot(page, `${P}-05-filtering-done`);
    if (!hasFilteringIndicator && triggered) {
      note(`[UX] [severity: major] No visible "this may take a moment" / filtering indicator was detected immediately after triggering AI match-filtering on Opportunities — under a slow connection this can look frozen (filtering took ${(filterMs / 1000).toFixed(1)}s total).`);
    }
  } catch (e) {
    note(`Match-filtering timing step failed: ${e.message}`);
  }

  // 4. Tender detail page + eligibility check under throttling
  const refTender = "597651-2026"; // ground truth deadline: 08 Sept 2026
  await timeIt(`Tender detail page load /tenders/${refTender}`, async () => {
    await goto(page, `/tenders/${refTender}`);
  });
  await shot(page, `${P}-06-tender-detail`);
  const tenderText = await page.locator("body").innerText().catch(() => "");
  note(`Tender ${refTender} detail snippet: ${tenderText.slice(0, 400).replace(/\s+/g, " ")}`);

  try {
    const eligStart = Date.now();
    await runEligibilityCheck(page);
    const eligMs = Date.now() - eligStart;
    await shot(page, `${P}-07-eligibility-result`);
    const eligText = await page.locator("body").innerText().catch(() => "");
    note(`[TIMING] Eligibility check on ${refTender} under throttling: ${(eligMs / 1000).toFixed(1)}s. Result snippet: ${eligText.slice(0, 800).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`[UX] [severity: major] Eligibility check on ${refTender} under throttling errored/timed out: ${e.message}`);
  }

  // Tap target check on tender detail page (mobile UX independent of speed)
  try {
    const buttons = await page.getByRole("button").all();
    let smallTargets = 0;
    for (const btn of buttons.slice(0, 15)) {
      const box = await btn.boundingBox().catch(() => null);
      if (box && (box.width < 44 || box.height < 44)) smallTargets++;
    }
    note(`Tender detail page: checked ${Math.min(buttons.length, 15)} buttons, ${smallTargets} below the 44x44px recommended mobile tap-target size.`);
    if (smallTargets > 2) {
      note(`[UX] [severity: minor] ${smallTargets} interactive buttons on the tender detail page are smaller than the recommended 44x44px mobile tap-target size.`);
    }
  } catch (e) {
    note(`Tap-target check failed: ${e.message}`);
  }

  // 5. Pricing on mobile + start (don't complete) Pro checkout under throttling
  await timeIt("Navigation to /pricing", async () => {
    await goto(page, "/pricing");
  });
  await shot(page, `${P}-08-pricing-mobile`);
  const pricingText = await page.locator("body").innerText().catch(() => "");
  const pricingHasHorizScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5).catch(() => false);
  note(`Pricing page mobile: horizontalOverflow=${pricingHasHorizScroll}. Snippet: ${pricingText.slice(0, 400).replace(/\s+/g, " ")}`);
  if (pricingHasHorizScroll) {
    note(`[UX] [severity: major] Pricing page has horizontal overflow on mobile (390px viewport) — pricing tables/cards are wider than the screen.`);
  }

  try {
    const checkoutStart = Date.now();
    const proBtn = page.getByRole("button", { name: /Pro/i }).or(page.getByRole("link", { name: /Pro/i })).first();
    let clicked = false;
    if (await proBtn.count()) {
      await proBtn.click({ timeout: 8000 }).catch(() => {});
      clicked = true;
    }
    await page.waitForTimeout(8000); // give the Paddle overlay time to load under throttling
    const checkoutMs = Date.now() - checkoutStart;
    await shot(page, `${P}-09-checkout-attempt`);
    const checkoutText = await page.locator("body").innerText().catch(() => "");
    const paddleFrameCount = page.frames().filter((f) => /paddle/i.test(f.url())).length;
    note(`[TIMING] Pro checkout start attempt under throttling: ${(checkoutMs / 1000).toFixed(1)}s elapsed, clicked=${clicked}, paddleIframesDetected=${paddleFrameCount}. STOPPED before any payment confirmation. Snippet: ${checkoutText.slice(0, 600).replace(/\s+/g, " ")}`);
    if (clicked && paddleFrameCount === 0) {
      note(`[UX] [severity: major] Clicked Pro upgrade but no Paddle checkout iframe was detected after ${(checkoutMs / 1000).toFixed(1)}s under throttled network — the checkout overlay may hang or fail silently on a slow connection.`);
    }
  } catch (e) {
    note(`Checkout start attempt failed: ${e.message}`);
  }

  // 6. Light AI accuracy / hallucination check via support chat (kept light per instructions)
  try {
    await goto(page, "/");
    const btn = page.getByRole("button", { name: /Ouvrir le chat d'assistance|Open support chat/i });
    const btnBox = await btn.boundingBox().catch(() => null);
    note(`Support chat bubble tap-target size: ${btnBox ? `${Math.round(btnBox.width)}x${Math.round(btnBox.height)}` : "not found"}`);
    const chatOpenStart = Date.now();
    await btn.click();
    await page.waitForTimeout(1000);
    const chatOpenMs = Date.now() - chatOpenStart;
    await shot(page, `${P}-10-chat-open`);
    note(`[TIMING] Support chat open under throttling: ${(chatOpenMs / 1000).toFixed(1)}s`);

    // Accuracy check
    const input = page.getByPlaceholder(/Écrivez votre message|Write your message/i);
    const q1Start = Date.now();
    await input.fill(`What is the deadline for tender ${refTender}?`);
    await input.press("Enter");
    // Watch for a typing indicator shortly after sending
    await page.waitForTimeout(1200);
    const midChatText = await page.locator("body").innerText().catch(() => "");
    await shot(page, `${P}-11-chat-inflight`);
    const hasTypingIndicator = /typing|en train d'écrire|\.\.\.|réflexion|thinking/i.test(midChatText.slice(-500));
    await page.waitForTimeout(15000);
    const q1Ms = Date.now() - q1Start;
    const t1 = await page.locator("body").innerText().catch(() => "");
    await shot(page, `${P}-12-chat-deadline-answer`);
    note(`[TIMING] Chat response for deadline question under throttling: ${(q1Ms / 1000).toFixed(1)}s total wait. Typing/in-progress indicator observed at ~1.2s: ${hasTypingIndicator}. Response snippet (ground truth: 08 Sept 2026): ${t1.slice(-1000).replace(/\s+/g, " ")}`);
    if (!hasTypingIndicator) {
      note(`[UX] [severity: minor] No clear typing/in-progress indicator observed shortly after sending a chat message under throttled network — a slow AI response could look like a silent hang.`);
    }

    // Hallucination check
    await input.fill("Can you tell me about tender 999999-2099?");
    await input.press("Enter");
    await page.waitForTimeout(15000);
    const t2 = await page.locator("body").innerText().catch(() => "");
    await shot(page, `${P}-13-chat-fake-tender`);
    note(`Chat hallucination check (fake tender 999999-2099) response snippet: ${t2.slice(-1000).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat check failed: ${e.message}`);
  }
} catch (e) {
  note(`FATAL: ${e.message}`);
} finally {
  await browser.close();
}

console.log("\n\n=== ALL FINDINGS (persona09) ===\n");
console.log(findings.join("\n\n---\n\n"));

// Write report
import fs from "node:fs";
const reportPath = "test-reports/persona-09-mobile-rural.md";
const report = `## Persona 9: Mobile-only user, rural area, spotty 4G
Mobile viewport (390x844), real network throttling applied (${throttleLevel}). Focus: load times, responsiveness, graceful degradation under bad network — hard technical/performance test.

### Steps taken (include actual measured load times)
${findings.map((f) => `- ${f.replace(/\n/g, " ")}`).join("\n")}

### Issues found
${findings.filter((f) => f.startsWith("[UX]") || f.startsWith("[AI]")).map((f) => `- ${f}`).join("\n") || "- (see timing/step notes above for full context)"}

### Ratings
- UX: TBD/5 — see below
- AI quality: TBD/5 — see below
`;

fs.mkdirSync("test-reports", { recursive: true });
fs.mkdirSync("test-reports/screenshots", { recursive: true });
fs.writeFileSync(reportPath, report, "utf-8");
console.log(`\nReport written to ${reportPath}`);
