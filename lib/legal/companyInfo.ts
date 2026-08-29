/**
 * Single source of truth for the facts terms.tsx/privacy.tsx/refund.tsx
 * quote about the legal entity operating TenderProc. Fill these in once
 * (from the Belgian company registration / KBO / Supabase dashboard) and
 * every legal page picks up the change — don't hardcode them again in the
 * page content.
 */
export const LEGAL_ENTITY = {
  name: "Nokhbat Al Mutakamilah lil Khadamaat atTijaria",
  /**
   * Kept for the legal/company record but deliberately NOT rendered on
   * terms/page.tsx or privacy/page.tsx anymore (as of 2026-08-29) — the
   * owner didn't want the street address / country spelled out on the
   * public site. Disclosure is trimmed to name + commercial registration
   * number + contact email, which is a judgment call on sufficiency, not
   * a certified-compliant minimum — revisit with actual legal counsel if
   * that matters before relying on it.
   */
  address: "Khalid Ibn Yazid, Madinah, Kingdom of Saudi Arabia (KSA)",
  /** Saudi commercial registration / tax number — labeled generically as
   * "Commercial Registration / Tax Number" in page copy rather than
   * asserting it's specifically a VAT number, since that wasn't confirmed. */
  companyNumber: "3123756993100003",
  contactEmail: "contact@tenderproc.com",
  /** Chosen governing law for the Terms — note this is a non-EU company
   * (Saudi Arabia) voluntarily designating Belgian law, not a company
   * headquartered there. */
  jurisdiction: "Belgium",
  /** AWS ap-southeast-1 — Singapore. Outside the EU/EEA, same as the
   * controller itself (Saudi Arabia); privacy/page.tsx's international
   * transfers section (§5) discloses this and relies on SCCs/an equivalent
   * Chapter V safeguard rather than treating it as in-region. */
  supabaseRegion: "Singapore (AWS ap-southeast-1)",
} as const;

export const LEGAL_DATES = {
  /** Bump whenever terms.tsx/privacy.tsx/refund.tsx content materially changes. */
  lastUpdated: "17 August 2026",
} as const;
