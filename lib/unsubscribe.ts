import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * One-click unsubscribe links for the automated notification emails
 * (lib/email.ts's sendNewTendersEmail / sendBetaFeedbackReminderEmail).
 * The token is an HMAC of the user id, not a lookup secret stored anywhere
 * — same signed-link approach as lib/billing/paddle.ts's webhook
 * verification, just applied to a URL instead of a request body. Anyone
 * with the link can unsubscribe that one user (no email confirmation
 * step), which is the standard one-click-unsubscribe tradeoff; the token
 * can't be reused to do anything else because app/api/unsubscribe/route.ts
 * only ever flips email_notifications_enabled to false.
 */
function unsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("UNSUBSCRIBE_SECRET (or CRON_SECRET) is not set — see .env.example.");
  }
  return secret;
}

function sign(userId: string): string {
  return createHmac("sha256", unsubscribeSecret()).update(userId).digest("hex");
}

export function buildUnsubscribeUrl(userId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.tenderproc.com";
  const token = sign(userId);
  return `${appUrl}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`;
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expectedBuf = Buffer.from(sign(userId), "hex");
  const actualBuf = Buffer.from(token, "hex");
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}
