import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/anthropic-provider";
import { ESCALATE_MARKER, stripEscalationMarker } from "@/lib/supportChat/escalation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deductTokens, peekTokens, TOKEN_COSTS, type TokenStatus } from "@/lib/billing/tokens";
import { getBetaPromoStatus } from "@/lib/billing/betaPromo";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-6";

// Bounds on client-supplied history so a single request can't balloon token
// usage — the widget only needs recent context, not the full transcript.
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

const BASE_SYSTEM_PROMPT = `You are the support assistant for TenderProc (tenderproc.com), an AI-assisted tender-matching platform that helps small and medium-sized businesses (SMEs) in Belgium find, evaluate, and bid on public tenders.

## What TenderProc does
- Scans public tender notices (including from publicprocurement.be) and matches them to a company's profile.
- Scores each tender against the company's services, certifications, and past references using AI, so a business can quickly judge fit.
- Extracts tender requirements and maps company evidence (services, certifications, references) to those requirements.
- Helps draft and review bid responses, and flags compliance risks before submission.

## Plans
- **Free** — Opportunities feed for 1 sector, manual search, tender detail pages, AI eligibility analysis on tender uploads (3/month).
- **Pro (€49/month)** — Opportunities feed for all sectors, AI match scores on every tender, unlimited AI eligibility analysis, the workflow pipeline board to track bids, daily email notifications.
- **Premium (€79/month)** — Everything in Pro, plus market overview & award analytics, and priority support.

## Common questions you should be able to answer
- **How tender matching works**: TenderProc scores tenders against the company's profile (services, certifications, references) using AI, surfacing the best-fit opportunities and flagging requirement gaps.
- **How to upgrade or downgrade a plan**: from the Billing page in the app, via "Upgrade to Pro/Premium" or "Manage plan", which opens the billing portal. A downgraded or canceled account keeps Free-tier access and can still view (but not create) results from a higher tier.
- **Billing questions**: subscriptions are billed monthly in EUR via Paddle; a failed payment starts a grace period (shown on the Billing page) before the account falls back to Free.
- **How to update the company profile**: from the Company page in the app, where the services, certifications, and references used for AI matching are managed.

## Tone
Helpful, concise, and professional. Prefer short, direct answers over long ones. Write in plain conversational sentences only — this reply is shown as plain text in a chat bubble, so never use markdown formatting (no **bold**, headers, or backticks). Use plain dashes for short lists if needed.

## When you can't help
There is no WhatsApp, phone, or live-chat handoff to a human — the only escalation channel is an email field that appears in this widget once you decide the user needs a human (see below); a person from the TenderProc team follows up by email, 9 AM–5 PM Brussels time. If you cannot resolve the user's question, don't have the information needed, or the user explicitly asks to speak with a person (including if they ask for WhatsApp or a phone number, which don't exist), say so clearly and directly — don't imply a live or instant channel exists — mention the operator hours, and let them know they can enter their email in the field that will appear below so the team can follow up.

When — and only when — you decide the user needs a human per the paragraph above, end your entire reply with the exact literal text ${ESCALATE_MARKER} and nothing after it. Never mention or explain this marker to the user; it is stripped before they see your reply. Do not include it for questions you can answer yourself.`;

/** Appends live beta-promo status so the bot never quotes a hardcoded promo
 * fact that goes stale once the promo ends or fills up — read the same way
 * the pricing page banner does (getBetaPromoStatus), not duplicated here. */
async function buildSystemPrompt(): Promise<string> {
  try {
    const admin = createAdminClient();
    const promo = await getBetaPromoStatus(admin);
    if (promo.active) {
      return `${BASE_SYSTEM_PROMPT}

## Current promotion
There is an active beta promotion right now: 50% off Pro or Premium for the first 6 months, limited to the first 20 subscribers overall (${promo.remaining} slot${promo.remaining === 1 ? "" : "s"} remaining). It's shown on the pricing page and applied automatically at checkout — mention it if the user asks about discounts or pricing.`;
    }
  } catch (err) {
    console.error("Could not read beta promo status for chat system prompt:", err);
  }
  return BASE_SYSTEM_PROMPT;
}

type ChatRole = "user" | "assistant";

function isChatRole(v: unknown): v is ChatRole {
  return v === "user" || v === "assistant";
}

function parseHistory(v: unknown): Anthropic.MessageParam[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (m): m is { role: ChatRole; content: string } =>
        isChatRole((m as { role?: unknown })?.role) &&
        typeof (m as { content?: unknown })?.content === "string" &&
        (m as { content: string }).content.trim().length > 0
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_MESSAGE_CHARS) }));
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY.", code: "serverMisconfigured" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Anonymous visitors can chat without signing in — the bot should attempt
  // an answer for everyone first, with email escalation as the fallback.
  // Only signed-in FREE-tier users are metered against their token balance;
  // anonymous traffic has no persisted rate limit by design (accepted
  // beta trade-off given low anonymous volume; max_tokens below bounds the
  // per-request cost).
  let tokenStatus: TokenStatus | null = null;
  if (user) {
    tokenStatus = await peekTokens(user.id);
    if (!tokenStatus.unlimited && tokenStatus.balance < TOKEN_COSTS.CHAT) {
      return NextResponse.json(
        { error: "You're out of free tokens this month. Upgrade for unlimited use.", code: "insufficientTokens" },
        { status: 402 }
      );
    }
  }

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Missing message.", code: "missingMessage" }, { status: 400 });
  }

  const history = parseHistory(body?.history);
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: message.slice(0, MAX_MESSAGE_CHARS) },
  ];

  const client = getAnthropicClient();

  try {
    const systemPrompt = await buildSystemPrompt();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const { text: reply, needsHuman } = stripEscalationMarker(raw);

    if (user && tokenStatus && !tokenStatus.unlimited) await deductTokens(user.id, TOKEN_COSTS.CHAT);

    return NextResponse.json({ reply, needsHuman });
  } catch (err) {
    console.error(err);

    // Any failure here — rate limit or otherwise — is also a trigger for
    // the frontend's WhatsApp fallback, so every branch sets needsHuman.
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Too many requests right now. Try again shortly.", code: "rateLimited", needsHuman: true },
        { status: 429 }
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "Chat failed. Try again in a moment.", code: "chatFailed", needsHuman: true },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Chat failed. Try again in a moment.", code: "chatFailed", needsHuman: true },
      { status: 500 }
    );
  }
}
