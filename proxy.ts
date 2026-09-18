import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locales";
import { routing } from "@/i18n/routing";

// Locale lives in the URL now (see i18n/routing.ts), not in a `locale` cookie,
// so the first-visit Accept-Language sniffing + cookie persistence that used
// to live here is gone — next-intl's own middleware does locale detection and
// rewrites "/pricing" → "/en/pricing" / "/fr/pricing" → "/fr/pricing" into the
// app/[locale] tree. Next.js only supports one proxy/middleware file, so the
// two are composed here.
const intlMiddleware = createIntlMiddleware(routing);

/** Splits "/fr/pricing" into { locale: "fr", pathname: "/pricing" }. With
 * `localePrefix: "as-needed"` the default locale carries no prefix, so
 * "/pricing" yields { locale: "en", pathname: "/pricing" } — which is exactly
 * what the auth checks below already expected before this migration, so every
 * `pathname.startsWith("/…")` test keeps working unchanged under a prefix. */
function splitLocale(pathname: string): { locale: Locale; pathname: string } {
  const [, maybeLocale, ...rest] = pathname.split("/");
  if (isLocale(maybeLocale)) {
    return { locale: maybeLocale, pathname: "/" + rest.join("/") };
  }
  return { locale: DEFAULT_LOCALE, pathname };
}

/** Builds an internal redirect target that keeps the visitor's locale, mirroring
 * what `localePrefix: "as-needed"` produces: no prefix for the default locale,
 * "/<locale>/…" for the others. (This file is middleware, not a Server
 * Component, so it can't use the locale-aware `redirect` from i18n/navigation.) */
function localizedPath(pathname: string, locale: Locale): string {
  return locale === DEFAULT_LOCALE ? pathname : `/${locale}${pathname}`;
}

export async function proxy(req: NextRequest) {
  // API routes live outside the [locale] segment — they must never be
  // locale-prefixed or rewritten, they only need the auth gate below.
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
  const { locale, pathname } = splitLocale(req.nextUrl.pathname);

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isPublic =
    isAuthPage ||
    // Root is the public marketing landing page — page.tsx itself redirects
    // an already-authenticated visitor on to /opportunities, so this only
    // needs to keep signed-out visitors from being bounced to /login first.
    pathname === "/" ||
    pathname.startsWith("/pricing") ||
    // Legal pages must be readable pre-auth — linked from the signup
    // consent checkbox and the marketing footer, before anyone has a session.
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/refund") ||
    // Contact form + FAQ must be reachable pre-auth — linked from the
    // marketing footer/nav for visitors who haven't signed up yet.
    pathname.startsWith("/contact") ||
    pathname.startsWith("/api/contact") ||
    // Tender detail pages are meant as shareable direct links (see the
    // "PublicTenderDetail" i18n namespace and app/[locale]/tenders/[id]/page.tsx,
    // which already branches its data-fetching on `if (user)` and never
    // fetches profile/match-score data for anonymous visitors). Writes
    // (AddToWorkflowButton, UploadAnalyzer's /api/analyze) independently
    // require a session regardless of this page-level gate.
    pathname.startsWith("/tenders") ||
    // Support chat widget is rendered site-wide, including the pre-auth
    // marketing pages above — it must work for signed-out visitors too.
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    // Has its own CRON_SECRET bearer-token check — not a user session.
    pathname.startsWith("/api/cron") ||
    // Paddle-to-server webhook call — has its own signature verification
    // (unmarshalWebhook / PADDLE_WEBHOOK_SECRET), never carries a user
    // session cookie. Redirecting it to /login would mean Paddle's
    // notifications never reach the actual handler at all.
    pathname.startsWith("/api/billing/webhook") ||
    // Called from the signup form right after auth.signUp(), before a
    // session exists (email confirmation is required on this project).
    // Insert-only server-side, see app/api/signup-profile/route.ts.
    pathname.startsWith("/api/signup-profile") ||
    // Company-name autocomplete on the signup form itself — also called
    // before any session exists. Read-only public KBO register data (see
    // supabase-kbo-companies-migration.sql), no user data exposed.
    pathname.startsWith("/api/company-search") ||
    // Native <form> fallback target for /signup (see app/[locale]/signup/page.tsx):
    // only reached when the page's client JS never hydrated, so there's no
    // session cookie to check — gating it here would 401 the exact visitor
    // it exists to help, hiding the "your browser blocked part of this
    // page" banner it's supposed to show instead.
    pathname.startsWith("/api/signup-fallback") ||
    // BetaFeedbackModal (mounted site-wide in app/[locale]/layout.tsx) polls
    // this on every page for every visitor, signed in or not — it does its own
    // supabase.auth.getUser() check and returns { due: null } for anonymous
    // callers, so it doesn't need the middleware's session gate too. Left
    // out of the public list, every signed-out page view would 401 here
    // before the route's own check ever ran.
    pathname.startsWith("/api/beta-feedback");

  // Every real page route that still requires a session — used below so an
  // unmatched path (typo, stale link, bot probe) falls through to Next's own
  // 404 instead of being redirected to /login. Without this, any garbage URL
  // returns a 200 "log in" page, which is both confusing (looks like the
  // path exists) and bad for SEO (soft-404s are indexable). Keep this in
  // sync with app/[locale]'s top-level route directories (/tenders is
  // deliberately excluded — see isPublic above).
  const PROTECTED_PAGE_PREFIXES = [
    "/admin",
    "/bids",
    "/billing",
    "/company",
    "/dashboard",
    "/forecast",
    "/market",
    "/my-tenders",
    "/opportunities",
    "/search",
    "/workflow",
  ];
  const isKnownProtectedPage = PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );

  // Cookies Supabase wants to write back (a refreshed session). Collected
  // rather than written onto a response here, because the response we
  // ultimately return isn't built until after the auth decision — see
  // finalize() below.
  const authCookies: Array<{ name: string; value: string; options?: object }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mutating req.cookies is what makes a refreshed session visible to
          // the render downstream: NextRequest's cookies are backed by the
          // request's `Cookie` header, and next-intl's rewrite forwards
          // `new Headers(request.headers)` upstream (see its middleware
          // source), so this has to happen *before* intlMiddleware runs.
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          authCookies.push(...cookiesToSet);
        },
      },
    }
  );

  /** Produces the response to return. With no argument, the request is allowed
   * through and next-intl gets to resolve/rewrite the locale (or issue its own
   * redirect, e.g. "/" → "/fr" for a French visitor). With an argument (a
   * /login redirect, or the 401 JSON), that response wins — there's nothing to
   * locale-rewrite on a URL that's about to change anyway. Either way any
   * refreshed Supabase session cookie is written onto it. */
  function finalize(res?: NextResponse) {
    const out = res ?? (isApiRoute ? NextResponse.next({ request: req }) : intlMiddleware(req));
    for (const { name, value, options } of authCookies) {
      out.cookies.set(name, value, options);
    }
    return out;
  }

  // Always call getUser() (not getSession()) in middleware — it revalidates
  // the token against Supabase instead of trusting a possibly-stale cookie.
  // This is a network call out to Supabase from the Edge runtime, and it can
  // fail transiently (regional latency, a cold connection, a brief Supabase
  // blip) independently of whether the visitor is actually logged in. Left
  // unguarded, that throws out of the middleware entirely, which Vercel
  // surfaces as a 503 for the *whole request* — including RSC/navigation
  // fetches, so a client-side <Link> click silently goes nowhere with no
  // error shown (this is what broke click-through into /my-tenders/[id]).
  // Every protected page and API route already re-validates the session
  // itself server-side (see e.g. app/[locale]/my-tenders/page.tsx's own
  // `if (!user) redirect(...)`), so it's safe to fail open here on a
  // genuine infra error and let that independent check decide instead of
  // 503ing the whole app on a hiccup that has nothing to do with auth.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  let authCheckFailed = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      user = (await supabase.auth.getUser()).data.user;
      authCheckFailed = false;
      break;
    } catch (err) {
      authCheckFailed = true;
      if (attempt === 0) continue;
      console.error("proxy: supabase.auth.getUser() failed twice, failing open", err);
    }
  }
  if (authCheckFailed) {
    return finalize();
  }

  if (!user && !isPublic) {
    // API routes are called via fetch(), which follows a redirect
    // transparently — the caller would see a 200 with the /login page's
    // HTML instead of a blocked request, breaking every route's own
    // { error, code: "notAuthenticated" } JSON contract (and any
    // client-side handling keyed off a 401 status). Page routes still get
    // the redirect so a browser navigation lands on the login form.
    if (pathname.startsWith("/api/")) {
      return finalize(
        NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 })
      );
    }
    if (!isKnownProtectedPage) {
      // Not a route this app actually serves — let it fall through
      // unauthenticated so Next.js's own routing returns a real 404 instead
      // of a misleading "log in" page.
      return finalize();
    }
    const url = req.nextUrl.clone();
    url.pathname = localizedPath("/login", locale);
    // Deliberately the *un-prefixed* path: /login hands it to the
    // locale-aware router from i18n/navigation, which re-applies the
    // visitor's prefix itself.
    url.searchParams.set("next", pathname);
    return finalize(NextResponse.redirect(url));
  }

  if (user && isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = localizedPath("/opportunities", locale);
    url.search = "";
    return finalize(NextResponse.redirect(url));
  }

  return finalize();
}

export const config = {
  // Also excludes any path with a file extension (e.g. /tenderproc-logo.svg,
  // a future /favicon.ico) — public/ static assets have no session cookie
  // and no need for the locale-routing/auth logic above, so without this
  // they'd otherwise get redirected to /login like a real protected route.
  // Confirmed safe against real app routes: TED publication-number ids
  // (used in /tenders/[id]) use hyphens, never dots (e.g. "769741-2025").
  // This is a superset of next-intl's recommended matcher (which also skips
  // /api and /_vercel): /api has to stay matched here because the auth gate
  // above is what serves the 401 JSON contract for unauthenticated API calls,
  // and it's excluded from locale rewriting inside the handler instead.
  matcher: ["/((?!_next/static|_next/image|_vercel|.*\\..*).*)"],
};
