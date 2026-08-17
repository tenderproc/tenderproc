/**
 * Structural data for the pricing page's paid tiers. Tier copy (name,
 * blurb, features) stays in messages/*.json — the app is localized into
 * nl/fr/de, so it can't live here as plain strings — this only maps each
 * tier to its Paddle price id and display config, per PADDLE_PRICE_IDS in
 * lib/paddle.ts, so app/pricing/page.tsx doesn't redefine them.
 */
import { PADDLE_PRICE_IDS } from "@/lib/paddle";

export interface PricingTierConfig {
  /** Matches the `Pricing.tiers.<key>` translation namespace in messages/*.json. */
  key: "pro" | "premium";
  tierName: "PRO" | "PREMIUM";
  priceId: { month: string };
  highlighted?: boolean;
}

export const PRICING_TIERS: PricingTierConfig[] = [
  { key: "pro", tierName: "PRO", priceId: { month: PADDLE_PRICE_IDS.PRO }, highlighted: true },
  { key: "premium", tierName: "PREMIUM", priceId: { month: PADDLE_PRICE_IDS.PREMIUM } },
];
