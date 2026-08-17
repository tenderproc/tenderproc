/**
 * Single source of truth for the facts terms.tsx/privacy.tsx/refund.tsx
 * quote about the legal entity operating TenderProc. Fill these in once
 * (from the Belgian company registration / KBO / Supabase dashboard) and
 * every legal page picks up the change — don't hardcode them again in the
 * page content.
 */
export const LEGAL_ENTITY = {
  name: "Nokhbat Al Mutakamilah lil Khadamaat atTijaria",
  /** As given by the company owner; "KSA" expanded once for formal legal text. */
  address: "Khalid Ibn Yazid, Madinah, Kingdom of Saudi Arabia (KSA)",
  /** Saudi commercial registration / tax number — labeled generically as
   * "Commercial Registration / Tax Number" in page copy rather than
   * asserting it's specifically a VAT number, since that wasn't confirmed. */
  companyNumber: "3123756993100003",
  contactEmail: "privacy@tenderproc.com",
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
