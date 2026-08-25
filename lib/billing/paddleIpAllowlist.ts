/**
 * Allowlist for the IPs Paddle sends webhook deliveries from. Fetched from
 * Paddle's own source of truth (api.paddle.com/ips or sandbox-api.paddle.com/ips
 * — see PADDLE_ENV) rather than hard-coded, since Paddle can add or rotate
 * these addresses without notice. HMAC signature verification
 * (unmarshalWebhook in lib/billing/paddle.ts) is still the primary defense;
 * this is a second, independent gate in front of it.
 */

interface CidrCache {
  cidrs: string[];
  fetchedAt: number;
}

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // re-fetch at most once an hour
// If a refresh fails (Paddle outage, transient network error), keep serving
// the last known-good list rather than failing every webhook delivery closed
// — up to this age, after which we'd rather fail closed than trust a
// day-plus-stale list.
const STALE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let cache: CidrCache | null = null;
let inFlight: Promise<CidrCache> | null = null;

function ipsEndpoint(): string {
  return process.env.PADDLE_ENV === "production"
    ? "https://api.paddle.com/ips"
    : "https://sandbox-api.paddle.com/ips";
}

async function fetchCidrs(): Promise<CidrCache> {
  const res = await fetch(ipsEndpoint(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Paddle IP list fetch failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { data?: { ipv4_cidrs?: string[] } };
  const cidrs = body.data?.ipv4_cidrs;
  if (!cidrs || cidrs.length === 0) {
    throw new Error("Paddle IP list response had no data.ipv4_cidrs");
  }
  return { cidrs, fetchedAt: Date.now() };
}

async function getCidrs(): Promise<string[]> {
  if (cache && Date.now() - cache.fetchedAt < REFRESH_INTERVAL_MS) {
    return cache.cidrs;
  }

  // Coalesce concurrent callers during a refresh into a single fetch.
  if (!inFlight) {
    inFlight = fetchCidrs().finally(() => {
      inFlight = null;
    });
  }

  try {
    cache = await inFlight;
    return cache.cidrs;
  } catch (err) {
    if (cache && Date.now() - cache.fetchedAt < STALE_CACHE_MAX_AGE_MS) {
      console.error("[Paddle IP allowlist] refresh failed, serving last known-good list:", err);
      return cache.cidrs;
    }
    throw err;
  }
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(range);
  if (ipInt === null || rangeInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/** Client IP as seen by this Vercel deployment. Vercel's edge sets/overwrites
 * x-forwarded-for with the real connecting IP as the first entry — on
 * Vercel's infrastructure this can't be spoofed by the calling client. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

export async function isAllowedPaddleWebhookIp(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const cidrs = await getCidrs();
  return cidrs.some((cidr) => ipInCidr(ip, cidr));
}

/** Test-only: clears the in-memory cache between test cases. */
export function _resetCacheForTests(): void {
  cache = null;
  inFlight = null;
}
