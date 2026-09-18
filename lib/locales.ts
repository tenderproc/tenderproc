export const LOCALES = ["en", "nl", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_META: Record<Locale, { label: string }> = {
  en: { label: "English" },
  nl: { label: "Nederlands" },
  fr: { label: "Français" },
  de: { label: "Deutsch" },
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

/** English name of the language, for use in AI prompts (clearer to the model
 * than the native LOCALE_META label). Only the three translatable target
 * locales are meaningful here — "en" is never passed to translateFields(). */
export const LOCALE_ENGLISH_NAME: Record<Locale, string> = {
  en: "English",
  nl: "Dutch",
  fr: "French",
  de: "German",
};
