import { Resend } from "resend";
import { TenderNotice } from "./types";
import { LEGAL_ENTITY } from "./legal/companyInfo";

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

/** One followed company's new match, for the digest email's "Companies you follow" section (app/api/cron/notify). */
export interface CompanyFollowMatchEmailItem {
  companyName: string;
  contractingAuthority: string;
  awardDate: string | null;
  url: string;
}

/**
 * Sends the daily digest email — new tenders in the user's sectors, plus
 * (when there's at least one) a "Companies you follow" section for any
 * followed company that newly won an ingested award notice
 * (app/api/cron/ingest-awards's matching step). Either list can be empty as
 * long as the other isn't; the caller (app/api/cron/notify) only calls this
 * when there's something to report.
 */
export async function sendNewTendersEmail(
  to: string,
  tenders: TenderNotice[],
  companyMatches: CompanyFollowMatchEmailItem[] = []
) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const tenderItems = tenders
    .map(
      (t) => `
        <li style="margin-bottom:16px;">
          <a href="${t.url}" style="font-weight:600;color:#111;text-decoration:none;">${escapeHtml(t.title)}</a><br/>
          <span style="color:#666;font-size:13px;">${escapeHtml(t.buyerName)} &middot; Deadline: ${formatDate(t.deadline)}</span>
        </li>`
    )
    .join("");

  const companyItems = companyMatches
    .map(
      (m) => `
        <li style="margin-bottom:16px;">
          <a href="${m.url}" style="font-weight:600;color:#111;text-decoration:none;">${escapeHtml(m.companyName)}</a><br/>
          <span style="color:#666;font-size:13px;">Won a contract with ${escapeHtml(m.contractingAuthority)} &middot; Awarded ${formatDate(m.awardDate)}</span>
        </li>`
    )
    .join("");

  const subject =
    companyMatches.length === 0
      ? tenders.length === 1
        ? "1 new tender matches your sectors"
        : `${tenders.length} new tenders match your sectors`
      : tenders.length === 0
        ? companyMatches.length === 1
          ? "1 company you follow has an update"
          : `${companyMatches.length} companies you follow have updates`
        : `${tenders.length} new tenders · ${companyMatches.length} company update${companyMatches.length === 1 ? "" : "s"}`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:560px;">
        <p style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">TenderProc</p>
        ${
          tenders.length > 0
            ? `<h1 style="font-size:20px;margin:4px 0 20px;">New in your sectors</h1>
        <ul style="list-style:none;padding:0;margin:0 0 24px;">${tenderItems}</ul>`
            : ""
        }
        ${
          companyMatches.length > 0
            ? `<h1 style="font-size:20px;margin:4px 0 20px;">Companies you follow</h1>
        <ul style="list-style:none;padding:0;margin:0;">${companyItems}</ul>`
            : ""
        }
        <p style="font-size:12px;color:#888;margin-top:24px;">You can change your sectors any time in Settings${companyMatches.length > 0 ? ", and manage followed companies under Market → Following" : ""}.</p>
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

export interface SupportChatEscalation {
  email: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

/** Sends the support-chat transcript to the support inbox when the bot
 * couldn't resolve the visitor's question (app/api/support-chat/escalate).
 * `replyTo` is the visitor's own address so a human can just hit reply. */
export async function sendSupportChatEscalation(submission: SupportChatEscalation) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const to = process.env.CONTACT_FORM_TO_EMAIL || LEGAL_ENTITY.contactEmail;

  const transcript = submission.messages
    .map(
      (m) =>
        `<p style="margin:0 0 10px;"><strong>${m.role === "user" ? "Visitor" : "Bot"}:</strong> ${escapeHtml(m.content)}</p>`
    )
    .join("");

  const { error } = await resend.emails.send({
    from,
    to,
    replyTo: submission.email,
    subject: `[Support chat] Escalation from ${submission.email}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;">
        <p style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">TenderProc support chat</p>
        <p><strong>Visitor email:</strong> ${escapeHtml(submission.email)}</p>
        <p style="font-size:12px;color:#888;margin:16px 0 8px;">Conversation:</p>
        ${transcript}
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

/** Day 7/30/90 nudge for beta feedback promo subscribers — a reminder only;
 * the actual feedback is captured in-app via BetaFeedbackModal (see
 * app/api/beta-feedback/*), not through this email. Sent once per milestone
 * by app/api/cron/beta-feedback-emails. */
export async function sendBetaFeedbackReminderEmail(to: string, milestone: 7 | 30 | 90) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.tenderproc.com";

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Quick favor? ${milestone} days in, we'd love your feedback`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;">
        <p style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">TenderProc beta</p>
        <h1 style="font-size:20px;margin:4px 0 16px;">How's it going so far?</h1>
        <p style="font-size:14px;color:#333;line-height:1.6;">
          You're one of our first 20 beta subscribers on the 50%-off promo — thank you.
          It's been ${milestone} days, and we'd really value a few minutes of your feedback
          to help shape what we build next.
        </p>
        <p style="margin:24px 0;">
          <a href="${appUrl}/opportunities" style="background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">
            Leave feedback in the app
          </a>
        </p>
        <p style="font-size:12px;color:#888;">A short prompt will be waiting for you next time you open TenderProc.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

/** Internal alert to every ADMIN_EMAILS address (see app/admin/beta-promo) —
 * used by monitoring crons that have no other way to surface a problem.
 * No-ops (does not throw) if ADMIN_EMAILS isn't set, since these are
 * best-effort alerts, not a user-facing flow whose failure should break
 * the caller. */
export async function sendAdminAlertEmail(subject: string, bodyLines: string[]) {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (adminEmails.length === 0) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const { error } = await resend.emails.send({
    from,
    to: adminEmails,
    subject: `[TenderProc alert] ${subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;">
        ${bodyLines.map((line) => `<p style="font-size:14px;color:#333;">${escapeHtml(line)}</p>`).join("")}
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

export interface ContactFormSubmission {
  name: string;
  email: string;
  company: string;
  reason: string;
  message: string;
}

export async function sendContactEmail(submission: ContactFormSubmission) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const to = process.env.CONTACT_FORM_TO_EMAIL || LEGAL_ENTITY.contactEmail;

  const { error } = await resend.emails.send({
    from,
    to,
    replyTo: submission.email,
    subject: `[Contact] ${submission.reason} — ${submission.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;">
        <p style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">TenderProc contact form</p>
        <p><strong>Name:</strong> ${escapeHtml(submission.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
        ${submission.company ? `<p><strong>Company:</strong> ${escapeHtml(submission.company)}</p>` : ""}
        <p><strong>Reason:</strong> ${escapeHtml(submission.reason)}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap;">${escapeHtml(submission.message)}</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
