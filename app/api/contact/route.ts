import { NextRequest, NextResponse } from "next/server";
import { sendContactEmail } from "@/lib/email";

const REASONS = new Set(["general", "pricing", "technical", "partnership"]);

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, company, reason, message } = body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Missing name." }, { status: 400 });
  }
  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "Missing or invalid email." }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Missing message." }, { status: 400 });
  }
  const cleanReason = typeof reason === "string" && REASONS.has(reason) ? reason : "general";

  try {
    await sendContactEmail({
      name: name.trim().slice(0, 200),
      email: email.trim().slice(0, 200),
      company: typeof company === "string" ? company.trim().slice(0, 200) : "",
      reason: cleanReason,
      message: message.trim().slice(0, 5000),
    });
  } catch {
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
