// Follow-up AI-quality retest for the 7 personas whose chat/eligibility
// checks got nothing but "chatFailed" errors during the original audit
// (credits were exhausted). Runs sequentially, real production calls, using
// each persona's real account and the same question set their original
// brief called for. Only re-tests AI quality — UX findings from the
// original audit still stand and aren't re-verified here.
import { launchPersona, goto, shot, openSupportChat, sendSupportChatMessage, runEligibilityCheck } from "./qa-lib.mjs";
import fs from "node:fs";

async function askChat(page, question, waitMs = 15000) {
  const before = await page.locator("body").innerText();
  await sendSupportChatMessage(page, question, { waitMs });
  const after = await page.locator("body").innerText();
  // Best-effort: grab whatever's new after the question text.
  const idx = after.lastIndexOf(question);
  const answer = idx >= 0 ? after.slice(idx + question.length).trim().slice(0, 800) : after.slice(before.length).trim().slice(0, 800);
  return answer;
}

async function runPersona(name, personaKey, questions, { eligibilityTenderId } = {}) {
  console.log(`\n===== ${name} (${personaKey ?? "unauthenticated"}) =====`);
  const { browser, context, page } = await launchPersona(personaKey ?? null, { headless: true });
  const result = { name, personaKey, qa: [], eligibility: null };

  try {
    await goto(page, "/opportunities").catch(() => goto(page, "/"));
    await openSupportChat(page);
    for (const q of questions) {
      try {
        const a = await askChat(page, q);
        console.log(`Q: ${q}\nA: ${a}\n`);
        result.qa.push({ question: q, answer: a });
      } catch (e) {
        console.log(`Q: ${q}\nERROR: ${e}\n`);
        result.qa.push({ question: q, answer: null, error: String(e) });
      }
    }
    if (eligibilityTenderId) {
      await goto(page, `/tenders/${eligibilityTenderId}`);
      try {
        await runEligibilityCheck(page);
        const text = await page.locator("body").innerText();
        result.eligibility = text.slice(-1000);
        console.log(`ELIGIBILITY (${eligibilityTenderId}):`, result.eligibility.slice(-400));
      } catch (e) {
        result.eligibility = `ERROR: ${e}`;
      }
    }
    await shot(page, `followup-${personaKey ?? "anon"}`);
  } finally {
    await browser.close();
  }
  return result;
}

const runs = [
  {
    name: "Persona 3: Startup founder",
    key: "pro_startup",
    eligibilityTenderId: "597390-2026",
    questions: [
      "What's the deadline for tender 597390-2026?",
      "Do you have an API integration feature for connecting to our own CRM?",
      "Can you give me details on tender 999999-2099?",
      "I'd like to talk to a human about a possible partnership. How do I reach someone?",
    ],
  },
  {
    name: "Persona 4: Procurement officer",
    key: null,
    questions: [
      "Can I use TenderProc to publish a tender as a public buyer?",
      "Do you offer e-procurement or e-tendering submission through your platform?",
      "Do you have a Government/Public Sector plan at 499 euros per month?",
      "I'd like to speak to a human about an institutional partnership.",
    ],
  },
  {
    name: "Persona 5: Non-profit admin",
    key: "free_nonprofit",
    eligibilityTenderId: "597651-2026",
    questions: [
      "What's the deadline for tender 597651-2026?",
      "Is there a discount for non-profits or ASBLs?",
      "Tell me about tender 999999-2099.",
      "I need to speak to a real person about my account.",
    ],
  },
  {
    name: "Persona 7: Complete beginner",
    key: "free_novice",
    eligibilityTenderId: "597390-2026",
    questions: [
      "What does CPV code mean?",
      "What happens after I submit a bid?",
      "How do I know if I'm even allowed to apply for a tender?",
      "I'm totally lost, can someone help me directly?",
    ],
  },
  {
    name: "Persona 8: Power user, multiple companies",
    key: "pro_startup",
    questions: [
      "Can I manage multiple companies under one account?",
      "Do you have an Enterprise plan with multi-seat/team access for managing 10+ company profiles?",
      "What's the deadline for tender 598497-2026?",
      "I need to speak with a human about setting up accounts for multiple business units.",
    ],
  },
  {
    name: "Persona 9: Mobile rural user",
    key: "free_novice",
    questions: [
      "What's the deadline for tender 597651-2026?",
      "Tell me about tender 999999-2099.",
    ],
  },
  {
    name: "Persona 10: Skeptical visitor",
    key: "free_novice",
    questions: [
      "Is there a free trial of Premium?",
      "Tell me about tender 999999-2099.",
      "I want to speak to a real person before I decide.",
    ],
  },
];

const allResults = [];
for (const r of runs) {
  const res = await runPersona(r.name, r.key, r.questions, { eligibilityTenderId: r.eligibilityTenderId });
  allResults.push(res);
}

fs.writeFileSync("test-reports/followup-ai-quality-results.json", JSON.stringify(allResults, null, 2));
console.log("\n\nSaved to test-reports/followup-ai-quality-results.json");
