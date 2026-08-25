// Minimal client for kbopub.economie.fgov.be's KBO Open Data portal — logs
// in via its legacy Spring Security form auth, finds the most recent "Full"
// export on the Downloads listing, and downloads it. Used by
// scripts/refresh-kbo-companies.ts.
//
// Reverse-engineered from the portal's actual login form and downloads-page
// HTML (there's no public API/docs for this) on 2026-08-24 — see
// docs/database.md's Company search section. If KBO changes the portal,
// this is the part most likely to need updating; loginAndFindLatestFullDownload
// throws a clear error rather than silently importing nothing if the
// authenticated page's markers aren't found.

import { load } from "cheerio";

const BASE = "https://kbopub.economie.fgov.be/kbo-open-data";
const LOGIN_PAGE_URL = `${BASE}/login`;
const LOGIN_POST_URL = `${BASE}/static/j_spring_security_check`;
const FILES_PAGE_URL = `${BASE}/affiliation/xml/?files`;

// This government server (or something in front of it) 400s Node's fetch
// with its bare default headers — no User-Agent, no Accept — even though
// the same request shape works fine from a real browser. Sent on every
// request, not just the login POST, since it's unclear which endpoint
// enforces it.
const BROWSER_LIKE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Node's fetch has no automatic cookie jar (unlike a browser) — this is a
// deliberately minimal one, just enough to carry the session cookie Spring
// Security issues across the login GET/POST and the subsequent downloads-page
// and zip-file requests.
class CookieJar {
  private cookies = new Map<string, string>();

  apply(headers: Headers) {
    for (const raw of headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

// Follows redirects manually (rather than fetch's built-in 'follow') so
// Set-Cookie headers from every hop get captured — 'follow' mode only
// exposes the final response's headers, and Spring Security's login flow
// sets/rotates the session cookie across a 302.
async function fetchFollowingRedirects(
  url: string,
  init: RequestInit,
  jar: CookieJar,
  maxRedirects = 5
): Promise<Response> {
  let currentUrl = url;
  let currentInit = init;
  for (let i = 0; i <= maxRedirects; i++) {
    const headers = new Headers(BROWSER_LIKE_HEADERS);
    new Headers(currentInit.headers).forEach((value, key) => headers.set(key, value));
    const cookieHeader = jar.header();
    if (cookieHeader) headers.set("Cookie", cookieHeader);
    const res = await fetch(currentUrl, { ...currentInit, headers, redirect: "manual" });
    jar.apply(res.headers);
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      currentUrl = new URL(location, currentUrl).href;
      // A redirect after a POST is conventionally followed as a GET, same
      // as a browser would.
      currentInit = { method: "GET" };
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects starting from ${url}`);
}

export type LatestDownload = { url: string; filename: string; jar: CookieJar };

export async function loginAndFindLatestFullDownload(
  username: string,
  password: string
): Promise<LatestDownload> {
  const jar = new CookieJar();

  // Spring Security expects a session to already exist from the login
  // page's GET before the credentials POST.
  await fetchFollowingRedirects(LOGIN_PAGE_URL, { method: "GET" }, jar);

  const loginRes = await fetchFollowingRedirects(
    LOGIN_POST_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://kbopub.economie.fgov.be",
        Referer: LOGIN_PAGE_URL,
      },
      body: new URLSearchParams({ j_username: username, j_password: password }).toString(),
    },
    jar
  );
  if (!loginRes.ok) {
    const body = await loginRes.text().catch(() => "");
    throw new Error(`KBO login request failed: HTTP ${loginRes.status}\n${body.slice(0, 1000)}`);
  }

  const filesRes = await fetchFollowingRedirects(FILES_PAGE_URL, { method: "GET" }, jar);
  const html = await filesRes.text();
  // The portal's footer prints this line (in whichever language) only once
  // actually authenticated — a failed login redirects back to the login
  // form instead, which wouldn't contain it.
  if (!/Logged in as|Ingelogd als|Connecté en tant que|Angemeldet als/.test(html)) {
    throw new Error(
      "KBO login didn't reach an authenticated page — check KBO_USERNAME/KBO_PASSWORD, or the portal's login flow may have changed."
    );
  }

  const $ = load(html);
  const rows: { date: Date; href: string }[] = [];
  $("table#row tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const dateText = $(cells[0]).text().trim();
    const href = $(cells[1]).find("a").attr("href");
    if (!href) return;
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return;
    rows.push({ date, href });
  });
  if (rows.length === 0) {
    throw new Error("Couldn't find any Full export link on the KBO downloads page — its layout may have changed.");
  }
  const latest = rows.reduce((a, b) => (b.date > a.date ? b : a));

  const url = new URL(latest.href, FILES_PAGE_URL).href;
  const filename = latest.href.split("/").pop()!;
  return { url, filename, jar };
}

export async function downloadWithJar(url: string, jar: CookieJar): Promise<ArrayBuffer> {
  // Same helper as login/listing, not a bare fetch() — a plain fetch() here
  // hit an infinite redirect loop (no browser-like headers, same underlying
  // cause as the login POST's 400 above).
  const res = await fetchFollowingRedirects(url, { method: "GET" }, jar);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  }
  return res.arrayBuffer();
}
