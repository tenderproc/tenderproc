import { Resend } from "resend";
import { TenderNotice } from "./types";

function formatDate(d: string | null) {
  if (!d) return "no deadline listed";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(s: string) {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

export async function sendNewTendersEmail(to: string, tenders: TenderNotice[]) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const items = tenders
    .map(
      (t) => `
        <li style="margin-bottom:16px;">
          <a href="${t.url}" style="font-weight:600;color:#111;text-decoration:none;">${escapeHtml(t.title)}</a><br/>
          <span style="color:#666;font-size:13px;">${escapeHtml(t.buyerName)} &middot; Deadline: ${formatDate(t.deadline)}</span>
        </li>`
    )
    .join("");

  const subject =
    tenders.length === 1
      ? "1 new tender matches your sectors"
      : `${tenders.length} new tenders match your sectors`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:560px;">
        <p style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">TenderProc</p>
        <h1 style="font-size:20px;margin:4px 0 20px;">New in your sectors</h1>
        <ul style="list-style:none;padding:0;margin:0;">${items}</ul>
        <p style="font-size:12px;color:#888;margin-top:24px;">You can change your sectors any time in Settings.</p>
      </div>
    `,
  });

  // The Resend SDK returns { error } instead of throwing on API-level
  // failures (e.g. sandbox address restrictions) — surface it so the caller
  // (the cron route) can report it instead of silently "succeeding".
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
