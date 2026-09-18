import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/locales";

/**
 * URL-based locale routing (next-intl's official setup).
 *
 * Locale used to live in a `locale` cookie, which meant `i18n/request.ts` had
 * to call `cookies()` from `next/headers` on every request. `cookies()` is a
 * Next.js dynamic API, so every page that renders *any* translation (which is
 * nearly all of them, directly or via `generateMetadata`) was forced into
 * per-request dynamic rendering — no static generation, no ISR, no CDN cache,
 * ~500-600ms TTFB with `X-Vercel-Cache: MISS` on every marketing page.
 *
 * With the locale in the path it's an ordinary route param that Next can
 * prerender per locale instead.
 *
 * `localePrefix: "as-needed"` keeps the default locale (en) unprefixed, so
 * every existing English URL (`/pricing`, `/signup`, ...) stays byte-identical
 * — no redirects, no broken backlinks, no SEO churn for the majority locale.
 * Only nl/fr/de get a prefix (`/fr/pricing`).
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
});
