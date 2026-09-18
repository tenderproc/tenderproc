import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Resolves the locale from the URL's `[locale]` segment (set up by the
 * next-intl middleware composed into proxy.ts), NOT from a cookie.
 *
 * This used to read a `locale` cookie via `cookies()` from `next/headers`,
 * which opted every route that renders a translation into full per-request
 * dynamic rendering. `requestLocale` is a plain route param, so pages without
 * their own per-request dynamism can be statically prerendered per locale.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
