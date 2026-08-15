export const LOCALES = ["en", "nl", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "locale";

export const LOCALE_META: Record<Locale, { label: string; flag: string }> = {
  en: { label: "English", flag: "🇬🇧" },
  nl: { label: "Nederlands", flag: "🇳🇱" },
  fr: { label: "Français", flag: "🇫🇷" },
  de: { label: "Deutsch", flag: "🇩🇪" },
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Region-qualified variant for Intl.DateTimeFormat/NumberFormat, so English
 * stays DD Month YYYY (Belgian/EU convention) instead of Intl's US default. */
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en-GB",
  nl: "nl-BE",
  fr: "fr-BE",
  de: "de-BE",
};

/** Picks the best-matching supported locale from an Accept-Language header value. */
export function pickLocaleFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const preferred = header
    .split(",")
    .map((part) => part.trim().split(";")[0]?.slice(0, 2).toLowerCase());
  for (const lang of preferred) {
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}
