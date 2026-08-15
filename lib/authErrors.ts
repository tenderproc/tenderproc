/** Supabase Auth (GoTrue) returns English error messages we don't control.
 * Map the common ones to translated text by matching known substrings;
 * anything unrecognized falls back to the raw English message rather than
 * showing nothing. */
const KNOWN_PATTERNS: { match: RegExp; code: string }[] = [
  { match: /invalid login credentials/i, code: "invalidCredentials" },
  { match: /email not confirmed/i, code: "emailNotConfirmed" },
  { match: /user already registered/i, code: "userAlreadyRegistered" },
  { match: /password should be at least/i, code: "passwordTooShort" },
  { match: /unable to validate email address/i, code: "invalidEmail" },
  { match: /rate limit/i, code: "rateLimited" },
];

export function authErrorMessage(rawMessage: string, t: (key: string) => string): string {
  const found = KNOWN_PATTERNS.find((p) => p.match.test(rawMessage));
  if (!found) return rawMessage;
  try {
    return t(found.code);
  } catch {
    return rawMessage;
  }
}
