// Persona 4: Public-sector procurement officer (unauthenticated). Evaluates
// the site from the BUYER side (publishes tenders, not bids), scrutinizes
// footer legal pages (Terms/Privacy/Refund) in EN + FR for translation
// completeness and compliance signals (VAT/company registration/GDPR), and
// checks /contact for trust signals. NOT logging in at all.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { goto, shot, openSupportChat, getSupportChatText, log } from "./qa-lib.mjs";

// Local override of qa-lib's sendSupportChatMessage: the EN-locale widget's
// placeholder is "Type your message...", which the shared helper's regex
// (French/English "write your message" only) does not match. Avoid editing
// the shared qa-lib.mjs since other persona sessions may run concurrently
// against the same checkout (per prior QA session notes).
async function sendChatMessage(page, message, { waitMs = 12000 } = {}) {
  const input = page
    .getByPlaceholder(/Écrivez votre message|Write your message|Type your message/i)
    .or(page.locator('input[type="text"]').last());
  await input.first().fill(message);
  await input.first().press("Enter");
  await page.waitForTimeout(waitMs);
}

const P = "persona04";
const findings = [];

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

async function setLocale(context, value) {
  await context.addCookies([{ name: "locale", value, url: "https://www.tenderproc.com" }]);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);

try {
  // 1. Homepage cold landing (EN)
  await setLocale(context, "en");
  await goto(page, "/");
  await shot(page, `${P}-01-homepage-en`);
  const homeText = await page.locator("body").innerText();
  note(`Homepage (EN) loaded. Snippet: ${homeText.slice(0, 1000).replace(/\s+/g, " ")}`);

  const buyerKeywords = /publish (a )?tender|issuing authority|contracting authority|for buyers|for public buyers|post a tender|create a tender|procurement officer/i;
  const sellerKeywords = /win (more )?contracts|find tenders|bid on|SMEs?|match(ing)? (you )?with tenders|find (the )?right tenders/i;
  note(`Buyer-side messaging detected on homepage: ${buyerKeywords.test(homeText)}`);
  note(`Seller/bidder-side messaging detected on homepage: ${sellerKeywords.test(homeText)}`);

  // Look at footer links
  await page.locator("footer").scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, `${P}-02-footer-en`);
  const footerLinks = await page.locator("footer a").evaluateAll((els) =>
    els.map((e) => ({ text: e.textContent?.trim(), href: e.getAttribute("href") }))
  );
  note(`Footer links found: ${JSON.stringify(footerLinks)}`);

  // 2. Legal pages - discover paths from footer, EN
  const legalNames = { terms: /terms/i, privacy: /privacy/i, refund: /refund/i };
  const legalPaths = {};
  for (const [key, re] of Object.entries(legalNames)) {
    const match = footerLinks.find((l) => re.test(l.text || "") || re.test(l.href || ""));
    if (match) legalPaths[key] = match.href;
  }
  note(`Discovered legal page paths: ${JSON.stringify(legalPaths)}`);

  const legalTextsEn = {};
  for (const [key, href] of Object.entries(legalPaths)) {
    try {
      await goto(page, href);
      await shot(page, `${P}-03-${key}-en`);
      const text = await page.locator("body").innerText();
      legalTextsEn[key] = text;
      note(`[EN] ${key} page (${href}) loaded, length=${text.length}. Snippet: ${text.slice(0, 500).replace(/\s+/g, " ")}`);
      const hasVat = /VAT|BE\s?0\d{3}\.?\d{3}\.?\d{3}|BTW|registration number|company number|KBO|entreprise n°/i.test(text);
      const hasNoticePeriod = /\d+\s*(day|days|jour|jours)\b/i.test(text);
      const hasCancellation = /cancel|refund|reimburs|rembours/i.test(text);
      note(`[EN] ${key}: mentions VAT/registration=${hasVat}, mentions numeric notice period=${hasNoticePeriod}, mentions cancellation/refund=${hasCancellation}`);
    } catch (e) {
      note(`[EN] ${key} page failed to load (${href}): ${e.message}`);
    }
  }

  // Same legal pages in French
  await setLocale(context, "fr");
  const legalTextsFr = {};
  for (const [key, href] of Object.entries(legalPaths)) {
    try {
      await goto(page, href);
      await shot(page, `${P}-04-${key}-fr`);
      const text = await page.locator("body").innerText();
      legalTextsFr[key] = text;
      note(`[FR] ${key} page (${href}) loaded, length=${text.length}. Snippet: ${text.slice(0, 500).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`[FR] ${key} page failed to load (${href}): ${e.message}`);
    }
  }

  // Rough translation-completeness check: compare lengths and check the FR
  // text isn't just the English text re-served (untranslated fallback).
  for (const key of Object.keys(legalPaths)) {
    const en = legalTextsEn[key];
    const fr = legalTextsFr[key];
    if (en && fr) {
      const lenRatio = fr.length / en.length;
      const looksIdentical = en.trim() === fr.trim();
      const frHasEnglishWords = /\b(the|and|shall|agreement|refund)\b/i.test(fr);
      note(`Translation check [${key}]: EN length=${en.length}, FR length=${fr.length}, ratio=${lenRatio.toFixed(2)}, identical=${looksIdentical}, FR contains common English words=${frHasEnglishWords}`);
    }
  }

  // 3. Market Overview / Contract Awards page (logged out)
  await setLocale(context, "en");
  for (const path of ["/market", "/market-overview", "/contract-awards", "/awards"]) {
    try {
      await goto(page, path);
      const text = await page.locator("body").innerText();
      const status = page.url();
      await shot(page, `${P}-05-market-${path.replace(/\//g, "")}`);
      note(`Tried ${path} -> resolved URL ${status}. Snippet: ${text.slice(0, 500).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`${path} failed: ${e.message}`);
    }
  }
  // Also check homepage/nav for a "Market" link explicitly
  await goto(page, "/");
  const marketLink = page.getByRole("link", { name: /market|awards|contract awards/i }).first();
  if (await marketLink.count()) {
    const href = await marketLink.getAttribute("href");
    note(`Found nav link to market/awards page: href=${href}`);
    try {
      await marketLink.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
      await shot(page, `${P}-06-market-nav-click`);
      const text = await page.locator("body").innerText();
      note(`Market page via nav click. URL now: ${page.url()}. Snippet: ${text.slice(0, 1000).replace(/\s+/g, " ")}`);
      const gated = /premium|upgrade|subscribe|sign up|log in|login/i.test(text);
      note(`Market page appears gated/requires-auth for logged-out visitor: ${gated}`);
    } catch (e) {
      note(`Market nav link click failed: ${e.message}`);
    }
  } else {
    note("No 'Market'/'Awards' nav link found in header/homepage while logged out.");
  }

  // 4. Contact page
  try {
    await goto(page, "/contact");
    await shot(page, `${P}-07-contact-en`);
    const text = await page.locator("body").innerText();
    note(`/contact (EN) loaded. Full text: ${text.replace(/\s+/g, " ")}`);
    const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
    const hasAddress = /\d{4}\s+\w+|Belgium|Belgique|België/i.test(text);
    const hasVat = /VAT|BTW|BE\s?0\d{3}/i.test(text);
    const hasRegNumber = /registration|KBO|company number|n°\s*d'entreprise/i.test(text);
    note(`/contact trust signals: hasEmail=${hasEmail}, hasAddress=${hasAddress}, hasVat=${hasVat}, hasRegNumber=${hasRegNumber}`);
  } catch (e) {
    note(`/contact failed to load: ${e.message}`);
  }

  // 5. Support chat - reachable without login?
  await goto(page, "/");
  let chatReachable = false;
  try {
    await openSupportChat(page);
    await shot(page, `${P}-08-chat-open`);
    chatReachable = true;
    note("Support chat widget opened successfully while logged out.");
  } catch (e) {
    note(`Support chat could not be opened while logged out: ${e.message}`);
  }

  if (chatReachable) {
    try {
      await sendChatMessage(page, "Can I use TenderProc to publish a tender as a public buyer?", { waitMs: 12000 });
      const t1 = await getSupportChatText(page);
      await shot(page, `${P}-09-chat-buyer-question`);
      note(`Chat Q1 (publish as public buyer) response snippet: ${t1.slice(-1500).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Support chat Q1 failed: ${e.message}`);
    }

    try {
      await sendChatMessage(page, "What data do you use as your tender source?", { waitMs: 12000 });
      const t2 = await getSupportChatText(page);
      await shot(page, `${P}-10-chat-data-source`);
      note(`Chat Q2 (data source) response snippet: ${t2.slice(-1500).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Support chat Q2 failed: ${e.message}`);
    }

    try {
      await sendChatMessage(page, "Do you offer e-procurement or e-tendering submission through your platform, so I can submit my bid documents directly to the buyer?", { waitMs: 12000 });
      const t3 = await getSupportChatText(page);
      await shot(page, `${P}-11-chat-fake-eprocurement`);
      note(`Chat Q3 (hallucination check: fake e-procurement submission feature) response snippet: ${t3.slice(-1500).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Support chat Q3 failed: ${e.message}`);
    }

    try {
      await sendChatMessage(page, "Do you have a Government/Public Sector plan at 499 euros per month with dedicated procurement analytics?", { waitMs: 12000 });
      const t4 = await getSupportChatText(page);
      await shot(page, `${P}-12-chat-fake-plan`);
      note(`Chat Q4 (hallucination check: fake pricing plan) response snippet: ${t4.slice(-1500).replace(/\s+/g, " ")}`);
    } catch (e) {
      note(`Support chat Q4 failed: ${e.message}`);
    }

    try {
      await sendChatMessage(page, "I would like to speak to a human representative about a possible institutional partnership. How can I reach your team?", { waitMs: 12000 });
      const t5 = await getSupportChatText(page);
      await shot(page, `${P}-13-chat-human-handoff`);
      note(`Chat Q5 (explicit human handoff) response snippet: ${t5.slice(-1500).replace(/\s+/g, " ")}`);
      const mentionsWhatsapp = /whatsapp/i.test(t5.slice(-1500));
      const mentionsEmail = /email|e-mail|@tenderproc/i.test(t5.slice(-1500));
      note(`Handoff channel check: mentions WhatsApp=${mentionsWhatsapp}, mentions email=${mentionsEmail}`);
    } catch (e) {
      note(`Support chat Q5 failed: ${e.message}`);
    }
  }
} catch (e) {
  note(`FATAL error during run: ${e.stack || e.message}`);
} finally {
  await browser.close();
}

console.log("\n\n=== ALL FINDINGS ===\n");
console.log(findings.join("\n\n---\n\n"));

// Persist findings for report authoring
writeFileSync("test-reports/persona-04-raw-findings.txt", findings.join("\n\n---\n\n"), "utf-8");
