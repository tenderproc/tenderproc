// Persona 10: Skeptical first-time visitor, referred by a friend. Arrives
// cold with zero context. Mostly UNAUTHENTICATED — evaluates whether the
// landing page alone would convince a skeptical stranger to sign up: clear
// value prop above the fold, real trust signals (not vague marketing-speak),
// a genuinely low-risk free tier, and a clean signup flow (stopped short of
// the final submit). Then peeks at a read-only fresh-account dashboard
// (free_novice session) as a proxy for "would signing up have been worth it."
import { chromium } from "@playwright/test";
import { launchPersona, goto, shot, log } from "./qa-lib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const P = "persona10";
const findings = [];
const t0 = Date.now();

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

function elapsed() {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

mkdirSync("test-reports/screenshots", { recursive: true });

// ---------------------------------------------------------------------
// PART 1: Unauthenticated cold landing
// ---------------------------------------------------------------------
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: "locale", value: "en", url: "https://www.tenderproc.com" }]);
const page = await context.newPage();
page.setDefaultTimeout(20000);

try {
  // 1. Above-the-fold homepage — is the value prop instantly clear?
  await goto(page, "/");
  await shot(page, `${P}-01-homepage-above-fold`);
  const heroText = await page.locator("body").innerText();
  note(
    `[t=${elapsed()}] Homepage above-the-fold loaded (locale=en, no scroll). Snippet (judge: is it immediately clear what this product does and who it's for, with zero context?): ${heroText
      .slice(0, 1500)
      .replace(/\s+/g, " ")}`
  );

  // 2. Scroll through the full landing page — trust signals hunt.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await shot(page, `${P}-02-homepage-scrolled-bottom`);
  const fullText = await page.locator("body").innerText();

  const testimonialSignals = /témoignage|testimonial|"[^"]{20,}"|ils nous font confiance|our customers say/i.test(fullText);
  const statsSignals = /\d+\s*(%|utilisateurs|entreprises|PME|tenders|marchés|users|companies)/i.test(fullText);
  const logosSignals = /logo|as seen in|featured in|ils utilisent tenderproc/i.test(fullText);
  const credibilitySignals = /BCE|numéro d'entreprise|company registration|siège social|à propos|about us|notre équipe|our team|RGPD|GDPR|ISO\s?\d+|ssl|sécurisé|conforme/i.test(fullText);
  const vagueClaims = fullText.match(/IA(\s|-)?(puissante|avancée)?|AI[-\s]?powered|trusted by (SMEs|companies)|leader|meilleur|best-in-class|révolutionn\w+/gi) || [];

  note(
    `[t=${elapsed()}] Full landing page scanned (length=${fullText.length} chars). Testimonial/quote signals: ${testimonialSignals}. Numeric stats signals: ${statsSignals}. Customer-logo signals: ${logosSignals}. Credibility markers (registration/about/compliance): ${credibilitySignals}. Vague unbacked marketing phrases found (${vagueClaims.length}): ${[
      ...new Set(vagueClaims.map((s) => s.trim().toLowerCase())),
    ].join(", ") || "none"}. Full text dump for manual review: ${fullText.replace(/\s+/g, " ")}`
  );

  // Check for an explicit "About" / company info page/link
  const aboutLink = page.getByRole("link", { name: /à propos|about|qui sommes-nous|team|équipe/i }).first();
  const hasAboutLink = (await aboutLink.count()) > 0;
  note(`About/company-info nav link present: ${hasAboutLink}`);

  // 3. Pricing page — is Free tier genuinely usable / low-risk?
  await goto(page, "/pricing");
  await shot(page, `${P}-03-pricing`);
  const pricingText = await page.locator("body").innerText();
  note(
    `[t=${elapsed()}] /pricing loaded. Snippet (judge: does the Free tier look genuinely usable enough to evaluate the product before paying, or is it a bait-and-switch stub?): ${pricingText
      .slice(0, 2500)
      .replace(/\s+/g, " ")}`
  );

  // 4. Signup form — fill fields, evaluate validation/UX, STOP before submit.
  await goto(page, "/signup");
  await shot(page, `${P}-04-signup-blank`);
  const signupBlankText = await page.locator("body").innerText();
  note(`[t=${elapsed()}] /signup loaded (blank). Snippet: ${signupBlankText.slice(0, 1200).replace(/\s+/g, " ")}`);

  // Try clicking submit on an EMPTY form first to see required-field validation UX.
  const submitBtnCandidates = page.getByRole("button", { name: /S'inscrire|Créer.*compte|Sign up|Create account|Register/i });
  let requiredFieldValidationText = "not tested (submit button not found)";
  try {
    if (await submitBtnCandidates.count()) {
      await submitBtnCandidates.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await shot(page, `${P}-05-signup-empty-submit-validation`);
      requiredFieldValidationText = (await page.locator("body").innerText()).slice(0, 1500).replace(/\s+/g, " ");
    }
  } catch (e) {
    requiredFieldValidationText = `error triggering empty-submit validation: ${e.message}`;
  }
  note(`Empty-form submit attempt (to observe required-field validation UX only — NOT an actual submit of real data). Resulting page snippet: ${requiredFieldValidationText}`);

  // Now fill in plausible fake data field by field, WITHOUT clicking final submit.
  const fillAttempts = [];
  async function tryFill(selectorDesc, locator, value) {
    try {
      if (await locator.count()) {
        await locator.first().fill(value);
        fillAttempts.push(`${selectorDesc}: filled with "${value}"`);
        return true;
      }
      fillAttempts.push(`${selectorDesc}: NOT FOUND`);
      return false;
    } catch (e) {
      fillAttempts.push(`${selectorDesc}: fill failed (${e.message})`);
      return false;
    }
  }

  await tryFill("email", page.locator('input[type="email"], input[name*="email" i]'), "skeptical.visitor.qa@example.com");
  await tryFill(
    "password",
    page.locator('input[type="password"], input[name*="password" i]').first(),
    "N0tARealPassword!Qa" // NOTE: never typed into an actual login form, only a fresh signup field, never submitted
  );
  await tryFill("company name", page.locator('input[name*="company" i], input[placeholder*="entreprise" i], input[placeholder*="company" i]'), "QA Skeptic Test SPRL");
  await tryFill(
    "city/location",
    page.locator('input[name*="city" i], input[name*="ville" i], input[placeholder*="ville" i], input[placeholder*="city" i]'),
    "Liège"
  );

  // Sector checkboxes — try to check a couple to evaluate UX (multi-select, counts, etc.)
  const sectorCheckboxes = page.locator('input[type="checkbox"]');
  const sectorCount = await sectorCheckboxes.count();
  let sectorsChecked = 0;
  for (let i = 0; i < Math.min(sectorCount, 3); i++) {
    try {
      const cb = sectorCheckboxes.nth(i);
      const nameAttr = (await cb.getAttribute("name")) || "";
      const isTermsBox = /terms|cgu|conditions|agree/i.test(nameAttr);
      if (isTermsBox) continue; // leave terms checkbox alone deliberately for now
      await cb.check({ timeout: 3000 });
      sectorsChecked++;
    } catch {
      /* ignore individual checkbox failures */
    }
  }
  fillAttempts.push(`Sector/other checkboxes found: ${sectorCount}, successfully checked (excluding terms checkbox): ${sectorsChecked}`);

  await page.waitForTimeout(500);
  await shot(page, `${P}-06-signup-filled-form`);
  const filledFormText = await page.locator("body").innerText();
  note(
    `[t=${elapsed()}] Signup form filled with plausible fake data (STOPPED before final submit — no account created). Fill log: ${fillAttempts.join(
      " | "
    )}. Page snippet after filling (judge: password requirements shown? sector-selection UX clear? any inline validation?): ${filledFormText
      .slice(0, 2000)
      .replace(/\s+/g, " ")}`
  );

  // Check password requirements are visible/communicated anywhere near the password field
  const passwordHints = /\d+\s*(caractères|characters)|majuscule|minuscule|uppercase|lowercase|chiffre|special character|caractère spécial/i.test(filledFormText);
  note(`Password requirement hints visible on signup form: ${passwordHints}`);

  // Explicitly confirm: locate the final submit button but DO NOT click it.
  const finalSubmitBtn = page.getByRole("button", { name: /S'inscrire|Créer.*compte|Sign up|Create account|Register/i }).first();
  const finalSubmitPresent = (await finalSubmitBtn.count()) > 0;
  note(`Final submit button located (present: ${finalSubmitPresent}) — NOT clicked, per hard safety rule. No account was created during this test.`);

  // 5. Support chat while fully logged out — is it reachable at all pre-auth?
  await goto(page, "/");
  let chatReachableLoggedOut = false;
  try {
    const chatBtn = page.getByRole("button", { name: /Ouvrir le chat d'assistance|Open support chat/i });
    if (await chatBtn.count()) {
      await chatBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      chatReachableLoggedOut = true;
      await shot(page, `${P}-07-chat-logged-out`);
      const chatLoggedOutText = await page.locator("body").innerText();
      note(`[t=${elapsed()}] Support chat widget reachable while fully logged out: true. Snippet: ${chatLoggedOutText.slice(-1200).replace(/\s+/g, " ")}`);
    } else {
      note(`[t=${elapsed()}] Support chat widget button NOT found while fully logged out (chatReachableLoggedOut=false).`);
    }
  } catch (e) {
    note(`Support chat while logged out — error: ${e.message} (chatReachableLoggedOut likely false)`);
  }

  if (chatReachableLoggedOut) {
    // Run the AI quality checks right here, logged out, since it's reachable.
    async function askChat(question, label, waitMs = 14000) {
      try {
        const input = page.getByPlaceholder(/Écrivez votre message|Write your message/i);
        await input.fill(question);
        await input.press("Enter");
        await page.waitForTimeout(waitMs);
        const text = await page.locator("body").innerText();
        await shot(page, `${P}-08-chat-${label}`);
        note(`Chat (logged out) Q "${question}" [${label}] response snippet: ${text.slice(-1600).replace(/\s+/g, " ")}`);
      } catch (e) {
        note(`Chat (logged out) question [${label}] failed: ${e.message}`);
      }
    }

    await askChat(
      "What is the deadline for tender 597651-2026, and what's its estimated budget?",
      "accuracy-deadline-budget"
    );
    await askChat("Is there a free trial of the Premium plan?", "hallucination-fake-plan");
    await askChat("Can you tell me about tender 999999-2099?", "hallucination-fake-tender");
    await askChat("I'd like to talk to a real human, how do I do that?", "human-handoff");
  }
} catch (e) {
  note(`FATAL error during unauthenticated part: ${e.message}\n${e.stack}`);
} finally {
  await browser.close();
}

// ---------------------------------------------------------------------
// PART 2: Peek at a fresh/minimal authenticated account (free_novice)
// ---------------------------------------------------------------------
try {
  const { browser: browser2, page: page2 } = await launchPersona("free_novice", {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    await goto(page2, "/opportunities");
    await shot(page2, `${P}-09-dashboard-opportunities`);
    const oppText = await page2.locator("body").innerText();
    note(
      `[t=${elapsed()}] free_novice /opportunities loaded (proxy for "what a brand-new signup would see"). Snippet (judge: does this deliver on the landing page's promises? would it justify signing up?): ${oppText
        .slice(0, 2500)
        .replace(/\s+/g, " ")}`
    );

    // If the chat widget wasn't reachable logged out, run AI-quality checks here instead.
    let chatText = "";
    try {
      const chatBtn = page2.getByRole("button", { name: /Ouvrir le chat d'assistance|Open support chat/i });
      await chatBtn.click({ timeout: 8000 });
      await page2.waitForTimeout(1000);
      await shot(page2, `${P}-10-dashboard-chat-open`);

      async function askChat2(question, label, waitMs = 14000) {
        try {
          const input = page2.getByPlaceholder(/Écrivez votre message|Write your message/i);
          await input.fill(question);
          await input.press("Enter");
          await page2.waitForTimeout(waitMs);
          const text = await page2.locator("body").innerText();
          await shot(page2, `${P}-11-dashboard-chat-${label}`);
          note(`Chat (free_novice, authenticated) Q "${question}" [${label}] response snippet: ${text.slice(-1600).replace(/\s+/g, " ")}`);
          return text;
        } catch (e) {
          note(`Chat (free_novice) question [${label}] failed: ${e.message}`);
          return "";
        }
      }

      await askChat2(
        "What is the deadline for tender 597390-2026, and what's its estimated budget?",
        "accuracy-deadline-budget"
      );
      await askChat2("Is there a free trial of the Premium plan?", "hallucination-fake-plan");
      await askChat2("Can you tell me about tender 999999-2099?", "hallucination-fake-tender");
      await askChat2(
        "I'm a skeptical new user, is this AI actually trustworthy or is it just marketing hype?",
        "tone-persona-fit"
      );
      chatText = await askChat2("I'd like to talk to a real human, how do I do that?", "human-handoff");
    } catch (e) {
      note(`Support chat on authenticated free_novice dashboard failed to open: ${e.message}`);
    }
  } finally {
    await browser2.close();
  }
} catch (e) {
  note(`FATAL error during authenticated free_novice part: ${e.message}\n${e.stack}`);
}

console.log("\n\n=== ALL FINDINGS (persona10) ===\n");
console.log(findings.join("\n\n---\n\n"));

try {
  mkdirSync("test-reports", { recursive: true });
  writeFileSync("test-reports/persona-10-skeptical-visitor-raw-findings.txt", findings.join("\n\n---\n\n"), "utf-8");
} catch (e) {
  console.error(`Failed to write raw findings dump: ${e.message}`);
}
