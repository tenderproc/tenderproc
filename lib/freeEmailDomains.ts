/**
 * Consumer webmail domains disallowed for free-tier signups — TenderProc's
 * free tier is meant for businesses evaluating the product, not personal
 * inboxes. Paid tiers (see PRICING_TIERS) aren't restricted by this list.
 */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.be",
  "outlook.fr",
  "hotmail.com",
  "hotmail.be",
  "hotmail.fr",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.fr",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "yandex.com",
  "yandex.ru",
  "telenet.be",
  "skynet.be",
  "proximus.be",
]);

export function isFreeEmailDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  return FREE_EMAIL_DOMAINS.has(domain);
}
