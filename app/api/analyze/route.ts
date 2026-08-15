import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/ai/anthropic-provider";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are an assistant helping a small or medium-sized Belgian business
decide whether a public tender is worth pursuing. You are given the tender's
official metadata and, when available, the text of the tender document.

Respond ONLY with a JSON object matching exactly this shape, no other text:
{
  "verdict": "ELIGIBLE" | "REVIEW NEEDED" | "NOT ELIGIBLE",
  "summary": "2-3 plain-language sentences on what this tender is and whether an SME could realistically bid",
  "keyRequirements": ["short bullet", "short bullet", ...],
  "deadlineFlag": "a short warning if the deadline is very soon or unclear, otherwise null"
}

Use "REVIEW NEEDED" whenever the document is missing, incomplete, or genuinely
ambiguous — never guess eligibility from the title alone. Be conservative:
this is a screening aid, not a legal determination.`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY.", code: "serverMisconfigured" },
      { status: 500 }
    );
  }

  const { tender, documentText } = await req.json();
  if (!tender?.title) {
    return NextResponse.json({ error: "Missing tender info.", code: "missingTenderInfo" }, { status: 400 });
  }

  const client = getAnthropicClient();

  const userContent = `Tender metadata:
Title: ${tender.title}
Buyer: ${tender.buyerName}
Deadline: ${tender.deadline ?? "unknown"}
CPV codes: ${(tender.cpvCodes ?? []).join(", ") || "unknown"}
Estimated value: ${tender.totalValue ?? "unknown"}

Tender document text (may be empty if none was provided):
${documentText ? documentText.slice(0, 15000) : "(no document provided — base the review on the metadata above only, and default toward REVIEW NEEDED)"}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({
      ...parsed,
      disclaimer:
        "AI-generated screening only — always verify eligibility against the official tender documents before bidding.",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Analysis failed. Try again in a moment.", code: "analysisFailed" },
      { status: 500 }
    );
  }
}
