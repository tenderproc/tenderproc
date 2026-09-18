import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware drop-in replacements for `next/link` and `next/navigation`.
 *
 * Every internal navigation must go through these — with `localePrefix:
 * "as-needed"` a bare `next/link` href like "/pricing" would send an nl/fr/de
 * visitor to the unprefixed (English) route and silently drop their locale.
 * These add/strip the prefix automatically based on the active locale, and
 * `usePathname()` here returns the pathname *without* the locale prefix, so
 * active-tab comparisons like `pathname === "/opportunities"` keep working.
 */
const navigation = createNavigation(routing);

export const { Link, usePathname, useRouter, getPathname } = navigation;

// Annotated explicitly rather than destructured: TypeScript only applies
// "this call never returns" control-flow narrowing when the callee is a name
// with an explicit type annotation. Without this, `if (!user) redirect(...)`
// would stop narrowing `user` to non-null on the following lines.
export const redirect: typeof navigation.redirect = navigation.redirect;
export const permanentRedirect: typeof navigation.permanentRedirect =
  navigation.permanentRedirect;
