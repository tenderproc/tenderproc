import { NextRequest, NextResponse } from "next/server";
import { sendSupportChatEscalation } from "@/lib/email";

// Same bounds as app/api/chat/route.ts — a client-supplied transcript
// shouldn't be able to balloon the outgoing email.
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

type ChatRole = "user" | "assistant";

function isChatRole(v: unknown): v is ChatRole {
  return v === "user" || v === "assistant";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Missing or invalid email." }, { status: 400 });
  }

  const rawMessages: unknown[] = Array.isArray(body?.messages) ? body.messages : [];
  const messages = rawMessages
    .filter(
      (m: unknown): m is { role: ChatRole; content: string } =>
        isChatRole((m as { role?: unknown })?.role) &&
        typeof (m as { content?: unknown })?.content === "string" &&
        (m as { content: string }).content.trim().length > 0
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_MESSAGE_CHARS) }));

  if (messages.length === 0) {
    return NextResponse.json({ error: "Missing conversation." }, { status: 400 });
  }

  try {
    await sendSupportChatEscalation({ email, messages });
  } catch {
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
