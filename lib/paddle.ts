/**
 * Client-safe Paddle.js configuration — importable from both Server and
 * "use client" components. Nothing here is a secret: NEXT_PUBLIC_ vars are
 * inlined into the browser bundle by Next.js, so only publishable values
 * (client-side token, environment, price ids) belong in this file. The
 * Paddle API key and server-only PADDLE_PRICE_ID_* env vars live in
 * lib/billing/paddle.ts instead — never import that file from here or from
 * a client component.
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set — see .env.example.`);
  }
  return value;
}

const rawEnv = requireEnv("NEXT_PUBLIC_PADDLE_ENV", process.env.NEXT_PUBLIC_PADDLE_ENV);
if (rawEnv !== "sandbox" && rawEnv !== "production") {
  throw new Error(`NEXT_PUBLIC_PADDLE_ENV must be "sandbox" or "production", got "${rawEnv}".`);
}
/** Never defaults — running checkout against the wrong Paddle account
 * silently is worse than crashing loudly at startup. */
export const PADDLE_ENV: "sandbox" | "production" = rawEnv;

export const PADDLE_CLIENT_TOKEN = requireEnv(
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
);

/** Paid tiers only — Free has no Paddle price at all (see lib/billing/paddle.ts).
 * Same underlying price ids as PADDLE_PRICE_ID_PRO/PREMIUM in
 * lib/billing/paddle.ts, exposed here under NEXT_PUBLIC_ names because
 * Paddle.js needs the price id in the browser to open checkout — price ids
 * aren't secret, only the API key is. */
export const PADDLE_PRICE_IDS = {
  PRO: requireEnv("NEXT_PUBLIC_PADDLE_PRICE_ID_PRO", process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO),
  PREMIUM: requireEnv("NEXT_PUBLIC_PADDLE_PRICE_ID_PREMIUM", process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PREMIUM),
} as const;
