// Persona 7: Complete beginner / tender novice. Has never responded to a
// public tender before. Doesn't know what CPV codes, DUME, or "procedure
// types" mean. Relies heavily on the chatbot for guidance. This script
// judges the app almost entirely through the zero-domain-knowledge lens:
// does on-page copy + the AI features hand-hold someone who knows nothing,
// or does it assume prior knowledge and leave them lost?
import { launchPersona, goto, shot, openSupportChat, sendSupportChatMessage, getSupportChatText, waitForMatchFiltering, runEligibilityCheck, log } from "./qa-lib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const P = "persona07";
const findings = [];
const t0 = Date.now();

function note(msg) {
  console.log(msg);
  findings.push(msg);
}

function elapsed() {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`;
}

// Jargon terms a total beginner would not understand without an inline explanation.
const JARGON_TERMS = [
  "CPV",
  "DUME",
  "procédure ouverte",
  "procédure restreinte",
  "procédure négociée",
  "type de procédure",
  "avis de marché",
  "pouvoir adjudicateur",
  "cahier des charges",
  "soumissionnaire",
  "offre irrégulière",
];

function findJargonHits(text) {
  return JARGON_TERMS.filter((term) => new RegExp(term.replace(/\s+/g, "\\s+"), "i").test(text));
}

const { browser, context, page } = await launchPersona("free_novice", {
  headless: true,
  viewport: { width: 1440, height: 900 },
});

try {
  // 1. Homepage cold landing — does it explain what a "public tender" is, in plain language?
  await goto(page, "/");
  await shot(page, `${P}-01-homepage`);
  const homeText = await page.locator("body").innerText();
  const explainsWhatATenderIs =
    /march[ée]s? public|appel d'offres|qu'est-ce qu'un march[ée]|contrat(s)? public/i.test(homeText) &&
    /qu'est-ce|c'est quoi|comment (ça|cela) fonctionne|découvrez|expliqu/i.test(homeText);
  note(
    `[t=${elapsed()}] Homepage loaded. Beginner-oriented "what is a public tender / how does this work" explanatory copy detected: ${explainsWhatATenderIs}. Snippet: ${homeText
      .slice(0, 1200)
      .replace(/\s+/g, " ")}`
  );
  const homeJargon = findJargonHits(homeText);
  note(`Jargon terms found on homepage without (visible, from this scan) plain-language gloss: ${homeJargon.length ? homeJargon.join(", ") : "none"}`);

  // 2. Profile check — verify actual profile, don't assume specifics
  try {
    await goto(page, "/profile");
    await shot(page, `${P}-02-profile`);
    const profileText = await page.locator("body").innerText();
    note(`[t=${elapsed()}] /profile loaded. Snippet (verify actual generic/minimal profile content): ${profileText.slice(0, 1200).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Direct /profile nav failed: ${e.message}. Trying "Mon profil" nav link instead.`);
    try {
      await goto(page, "/");
      const profLink = page.getByRole("link", { name: /Mon profil|Profil|My profile/i }).first();
      if (await profLink.count()) {
        await profLink.click();
        await page.waitForTimeout(1500);
        await shot(page, `${P}-02b-profile-via-nav`);
        const profileText2 = await page.locator("body").innerText();
        note(`Profile via nav link. Snippet: ${profileText2.slice(0, 1200).replace(/\s+/g, " ")}`);
      } else {
        note('Could not find a "Mon profil" nav link either.');
      }
    } catch (e2) {
      note(`Profile via nav also failed: ${e2.message}`);
    }
  }

  // 3. Opportunities feed — with a generic/minimal profile, are matches sensible,
  // and does the app guide the user to improve their profile if matches look vague?
  let tStart = Date.now();
  await goto(page, "/opportunities");
  const oppLoadMs = Date.now() - tStart;
  await shot(page, `${P}-03-opportunities-initial`);
  await waitForMatchFiltering(page);
  await shot(page, `${P}-04-opportunities-settled`);
  const oppText = await page.locator("body").innerText();
  const suggestsProfileImprovement = /compl[ée]t(e|er|ez)?\s+(votre|le)?\s*profil|am[ée]lior(er|ez)\s+(votre|le)?\s*profil|profil incomplet|update your profile|complete your profile/i.test(
    oppText
  );
  note(
    `[t=${elapsed()}] /opportunities loaded in ${oppLoadMs}ms. App nudges user to improve a generic/minimal profile: ${suggestsProfileImprovement}. Snippet (judge match relevance/vagueness for a generic profile): ${oppText
      .slice(0, 2500)
      .replace(/\s+/g, " ")}`
  );

  // 4. Reference tender detail pages — hunt for unexplained jargon a beginner would hit
  const refTenders = ["597390-2026", "597651-2026", "598497-2026"];
  for (const id of refTenders) {
    try {
      await goto(page, `/tenders/${id}`);
      await page.waitForTimeout(1200);
      await shot(page, `${P}-05-ref-tender-${id}`);
      const text = await page.locator("body").innerText();
      const hits = findJargonHits(text);
      note(
        `Reference tender ${id} page loaded. Jargon terms present (unexplained, from raw text scan): ${
          hits.length ? hits.join(", ") : "none detected"
        }. Snippet: ${text.slice(0, 1000).replace(/\s+/g, " ")}`
      );
    } catch (e) {
      note(`Reference tender ${id} failed to load: ${e.message}`);
    }
  }

  // 5. Eligibility check tool on reference tender 1 — the feature most relevant to
  // "am I even allowed to bid on this?" for a total novice.
  try {
    await goto(page, `/tenders/${refTenders[0]}`);
    await page.waitForTimeout(1000);
    await runEligibilityCheck(page);
    await shot(page, `${P}-06-eligibility-${refTenders[0]}`);
    const text = await page.locator("body").innerText();
    note(`Eligibility check ran on ${refTenders[0]}. Full-page snippet after check (judge: would a total novice understand this result?): ${text.slice(0, 2500).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Eligibility check on ${refTenders[0]} failed: ${e.message}`);
  }

  // 6. Pricing page + start Pro checkout (STOP before payment) — is it clear what
  // a first-timer is paying for?
  try {
    await goto(page, "/pricing");
    await shot(page, `${P}-07-pricing`);
    const pricingText = await page.locator("body").innerText();
    note(`/pricing loaded. Snippet (judge clarity of what's being paid for, for a first-timer with zero domain knowledge): ${pricingText.slice(0, 1800).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`/pricing failed: ${e.message}`);
  }

  try {
    const upgradeBtn = page.getByRole("button", { name: /S'abonner|Passer.*Pro|Choisir|Mettre à niveau|Upgrade|Subscribe/i }).first();
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
    await shot(page, `${P}-08-checkout-attempt`);
    const checkoutText = await page.locator("body").innerText().catch(() => "");
    note(
      `Attempted to start Pro checkout, clicked=${clicked}. STOPPED before any payment confirmation button. Snippet: ${checkoutText
        .slice(0, 1200)
        .replace(/\s+/g, " ")}`
    );
  } catch (e) {
    note(`Checkout start failed: ${e.message}`);
  }

  // 7. Support chat — main focus. All questions phrased the way a total novice would ask them.
  await goto(page, "/");
  try {
    await openSupportChat(page);
    await shot(page, `${P}-09-chat-open`);
  } catch (e) {
    note(`Opening support chat failed: ${e.message}`);
  }

  // Q1: Accuracy + eligibility-helpfulness check (ground truth: 30 Sept 2026)
  try {
    await sendSupportChatMessage(
      page,
      "Bonjour, je n'y connais rien du tout aux marchés publics. Quelle est la date limite pour le marché 597390-2026, et est-ce qu'une petite entreprise comme la mienne peut vraiment y répondre ?",
      { waitMs: 14000 }
    );
    const t1 = await getSupportChatText(page);
    await shot(page, `${P}-10-chat-deadline-eligibility`);
    note(
      `Chat Q1 (FR, deadline+eligibility for 597390-2026, ground truth deadline = 30 Sept 2026) response snippet: ${t1
        .slice(-1600)
        .replace(/\s+/g, " ")}`
    );
  } catch (e) {
    note(`Support chat Q1 failed: ${e.message}`);
  }

  // Q2: "What does CPV code mean?"
  try {
    await sendSupportChatMessage(page, "C'est quoi un code CPV ? Je vois ça partout et je ne comprends pas.", { waitMs: 14000 });
    const t2 = await getSupportChatText(page);
    await shot(page, `${P}-11-chat-cpv`);
    note(`Chat Q2 (FR, "what does CPV code mean?") response snippet (judge: patient/jargon-free/educational?): ${t2.slice(-1600).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q2 failed: ${e.message}`);
  }

  // Q3: "What happens after I submit a bid?"
  try {
    await sendSupportChatMessage(page, "Si je soumets une offre pour un marché, qu'est-ce qui se passe après ? Je ne sais pas du tout comment ça marche.", { waitMs: 14000 });
    const t3 = await getSupportChatText(page);
    await shot(page, `${P}-12-chat-after-bid`);
    note(`Chat Q3 (FR, "what happens after I submit a bid?") response snippet: ${t3.slice(-1600).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q3 failed: ${e.message}`);
  }

  // Q4: "How do I know if I'm even allowed to apply for a tender?"
  try {
    await sendSupportChatMessage(page, "Comment je sais si j'ai le droit de répondre à un marché public ? Je n'ai jamais fait ça.", { waitMs: 14000 });
    const t4 = await getSupportChatText(page);
    await shot(page, `${P}-13-chat-am-i-allowed`);
    note(`Chat Q4 (FR, "how do I know if I'm allowed to apply?") response snippet: ${t4.slice(-1600).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q4 failed: ${e.message}`);
  }

  // Q5: Hallucination check — fake tender
  try {
    await sendSupportChatMessage(page, "Pouvez-vous me parler du marché 999999-2099 ?", { waitMs: 14000 });
    const t5 = await getSupportChatText(page);
    await shot(page, `${P}-14-chat-fake-tender`);
    note(`Chat Q5 (FR, hallucination check, fake tender 999999-2099) response snippet: ${t5.slice(-1600).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q5 failed: ${e.message}`);
  }

  // Q6: Hallucination check — fake pricing plan
  try {
    await sendSupportChatMessage(page, "Est-ce que vous avez une offre 'Débutant' gratuite à vie avec accès illimité ?", { waitMs: 14000 });
    const t6 = await getSupportChatText(page);
    await shot(page, `${P}-15-chat-fake-plan`);
    note(`Chat Q6 (FR, hallucination check, fake 'Débutant' plan) response snippet: ${t6.slice(-1600).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q6 failed: ${e.message}`);
  }

  // Q7: Tone/persona-fit — explicit "I'm totally lost" framing
  try {
    await sendSupportChatMessage(
      page,
      "Je suis complètement perdu, je n'ai jamais répondu à un marché public de ma vie et je ne comprends pas le vocabulaire. Vous pouvez m'expliquer comme si j'étais débutant total ?",
      { waitMs: 14000 }
    );
    const t7 = await getSupportChatText(page);
    await shot(page, `${P}-16-chat-total-beginner`);
    note(`Chat Q7 (FR, explicit total-beginner framing, tone/persona-fit check) response snippet: ${t7.slice(-1600).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q7 failed: ${e.message}`);
  }

  // Q8: Handoff check — explicit human help request
  try {
    await sendSupportChatMessage(page, "J'aimerais parler à une vraie personne pour qu'elle m'aide, s'il vous plaît.", { waitMs: 14000 });
    const t8 = await getSupportChatText(page);
    await shot(page, `${P}-17-chat-human-handoff`);
    note(`Chat Q8 (FR, explicit human handoff request) response snippet: ${t8.slice(-1600).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q8 failed: ${e.message}`);
  }

  // Q9: Handoff check — something the bot plausibly can't answer
  try {
    await sendSupportChatMessage(page, "Pouvez-vous remplir et soumettre le dossier de candidature à ma place pour le marché 597390-2026 ?", { waitMs: 14000 });
    const t9 = await getSupportChatText(page);
    await shot(page, `${P}-18-chat-cant-answer`);
    note(`Chat Q9 (FR, request bot plausibly can't fulfill — filing a bid on the user's behalf) response snippet: ${t9.slice(-1600).replace(/\s+/g, " ")}`);
  } catch (e) {
    note(`Support chat Q9 failed: ${e.message}`);
  }
} finally {
  await browser.close();
}

console.log("\n\n=== ALL FINDINGS (persona07) ===\n");
console.log(findings.join("\n\n---\n\n"));

// Persist raw findings alongside the report in case the report-writing pass
// needs to be re-run separately.
try {
  mkdirSync("test-reports", { recursive: true });
  writeFileSync("test-reports/persona-07-novice-raw-findings.txt", findings.join("\n\n---\n\n"), "utf-8");
} catch (e) {
  console.error(`Failed to write raw findings dump: ${e.message}`);
}
