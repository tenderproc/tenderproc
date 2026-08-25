import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, isLocale, pickLocaleFromAcceptLanguage } from "@/lib/locales";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let response = NextResponse.next({ request: req });

  // First visit (no locale cookie yet): pick a default from Accept-Language so
  // the very first render is already in the visitor's language, then persist
  // it — the flag switcher (POST /api/locale) is what changes it afterwards.
  // Applied via withLocaleCookie() at every return point below, since the
  // Supabase client's setAll() reassigns `response` and the redirect branches
  // return a fresh NextResponse that wouldn't otherwise carry it.
  const localeToPersist = isLocale(req.cookies.get(LOCALE_COOKIE)?.value)
    ? null
    : pickLocaleFromAcceptLanguage(req.headers.get("accept-language"));
  function withLocaleCookie(res: NextResponse) {
    if (localeToPersist) {
      res.cookies.set(LOCALE_COOKIE, localeToPersist, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    return res;
  }

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
    // The locale switcher must work pre-auth too (e.g. from /pricing).
    pathname.startsWith("/api/locale");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Always call getUser() (not getSession()) in middleware — it revalidates
  // the token against Supabase instead of trusting a possibly-stale cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    // API routes are called via fetch(), which follows a redirect
    // transparently — the caller would see a 200 with the /login page's
    // HTML instead of a blocked request, breaking every route's own
    // { error, code: "notAuthenticated" } JSON contract (and any
    // client-side handling keyed off a 401 status). Page routes still get
    // the redirect so a browser navigation lands on the login form.
    if (pathname.startsWith("/api/")) {
      return withLocaleCookie(
        NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 })
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withLocaleCookie(NextResponse.redirect(url));
  }

  if (user && isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/opportunities";
    url.search = "";
    return withLocaleCookie(NextResponse.redirect(url));
  }

  return withLocaleCookie(response);
}

export const config = {
  // Also excludes any path with a file extension (e.g. /tenderproc-logo.svg,
  // a future /favicon.ico) — public/ static assets have no session cookie
  // and no need for the locale-cookie/auth logic below, so without this
  // they'd otherwise get redirected to /login like a real protected route.
  // Confirmed safe against real app routes: TED publication-number ids
  // (used in /tenders/[id]) use hyphens, never dots (e.g. "769741-2025").
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
