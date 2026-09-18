import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

function htmlPage(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>${title} — TenderProc</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 20px;color:#111;">
  <p style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">TenderProc</p>
  <h1 style="font-size:20px;margin:4px 0 16px;">${title}</h1>
  ${body}
</body>
</html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * One-click unsubscribe target for the links lib/email.ts adds to the
 * automated notification emails (digest, beta-feedback reminder). `u`/`t`
 * come from lib/unsubscribe.ts's buildUnsubscribeUrl — no login required,
 * same as every other one-click-unsubscribe implementation, since the
 * signed token is what authorizes the action, not a session.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("u");
  const token = req.nextUrl.searchParams.get("t");

  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return htmlPage(
      "Invalid unsubscribe link",
      `<p style="font-size:14px;color:#333;">This link is invalid or has expired. You can manage your email preferences from Settings after signing in.</p>`,
      400
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ email_notifications_enabled: false })
    .eq("id", userId);

  if (error) {
    return htmlPage(
      "Something went wrong",
      `<p style="font-size:14px;color:#333;">We couldn't process your request. Please try again later.</p>`,
      500
    );
  }

  return htmlPage(
    "You're unsubscribed",
    `<p style="font-size:14px;color:#333;">You won't receive any more tender digest or reminder emails from TenderProc. You can turn these back on any time from Settings.</p>`
  );
}
