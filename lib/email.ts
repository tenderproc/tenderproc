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
