"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import UpgradeButton from "./UpgradeButton";
import { getPaddleClient } from "@/lib/paddleClient";
import type { PricingTierConfig } from "@/lib/billing/pricingTiers";
import type { Tier as TierName } from "@/lib/billing/types";

const TIER_RANK: Record<TierName, number> = { FREE: 0, PRO: 1, PREMIUM: 2 };

interface CardViewModel {
  key: "free" | "pro" | "premium";
  tierName: TierName;
  highlighted?: boolean;
  priceId?: string;
  basePrice?: string;
}

export default function PricingCards({
  paidTiers,
  countryCode,
  currentTier,
  user,
  autoOpenPlan,
}: {
  paidTiers: PricingTierConfig[];
  /** From `x-vercel-ip-country`. Omitted entirely (not an "unknown"
   * sentinel) when the header isn't present — Paddle.PricePreview falls
   * back to IP-based geolocation on its own in that case. */
  countryCode?: string;
  currentTier: TierName;
  user: { id: string; email?: string } | null;
  /** Set from ?plan= after a signup redirect carried a plan choice through
   * (see app/signup/page.tsx) — opens that tier's checkout automatically
   * once, so picking a plan before signing up isn't a wasted click. */
  autoOpenPlan?: "pro" | "premium";
}) {
  const t = useTranslations("Pricing");
  // priceId -> Paddle's own formatted total string (e.g. "€49.00") — never
  // reformatted or recomputed here, just displayed as Paddle returns it.
  const [formattedTotals, setFormattedTotals] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPrices() {
      try {
        const paddle = await getPaddleClient();
        if (!paddle) throw new Error("Paddle.js failed to initialize");
        const response = await paddle.PricePreview({
          items: paidTiers.map((tier) => ({ priceId: tier.priceId.month, quantity: 1 })),
          ...(countryCode ? { address: { countryCode } } : {}),
        });
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const item of response.data.details.lineItems) {
          next[item.price.id] = item.formattedTotals.total;
        }
        setFormattedTotals(next);
      } catch {
        // Swallowed — the basePrice fallback already covers this case in
        // the render below, no separate error UI needed.
      }
    }

    loadPrices();
    return () => {
      cancelled = true;
    };
  }, [paidTiers, countryCode]);

  const cards: CardViewModel[] = [
    { key: "free", tierName: "FREE" },
    ...paidTiers.map((tier) => ({
      key: tier.key,
      tierName: tier.tierName,
      highlighted: tier.highlighted,
      priceId: tier.priceId.month,
      basePrice: tier.basePrice,
    })),
  ];

  return (
    <div className="grid sm:grid-cols-3 gap-6">
      {cards.map((card) => {
        const formattedPrice = card.priceId ? formattedTotals?.[card.priceId] : null;
        const canSubscribe = user && card.tierName !== "FREE" && TIER_RANK[currentTier] < TIER_RANK[card.tierName];

        return (
          <div
            key={card.key}
            className={`rounded-2xl p-6 flex flex-col ${
              card.highlighted
                ? "border-2 border-accent bg-accent/5 shadow-xs relative"
                : "border border-line bg-white"
            }`}
          >
            {card.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-semibold uppercase tracking-wide text-white bg-accent rounded-full px-3 py-1">
                {t("mostPopular")}
              </span>
            )}
            <h2 className="font-display font-semibold text-xl text-ink">{t(`tiers.${card.key}.name`)}</h2>
            <p className="text-sm text-inkDim mt-1">{t(`tiers.${card.key}.blurb`)}</p>

            <p className="mt-5">
              {card.tierName === "FREE" ? (
                <span className="font-display font-bold text-3xl text-ink">€0</span>
              ) : formattedPrice ? (
                <>
                  <span className="font-display font-bold text-3xl text-ink">{formattedPrice}</span>
                  <span className="text-sm text-inkDim">{t("perMonth")}</span>
                </>
              ) : card.basePrice ? (
                // Instant fallback — the exact localized/currency-converted
                // total from Paddle.PricePreview (formattedPrice above)
                // swaps in silently once it resolves, so the visitor never
                // sees an empty "Loading price…" placeholder where a real
                // number should be.
                <>
                  <span className="font-display font-bold text-3xl text-ink">{card.basePrice}</span>
                  <span className="text-sm text-inkDim">{t("perMonth")}</span>
                </>
              ) : (
                <span className="text-sm text-inkDim">{t("priceUnavailable")}</span>
              )}
            </p>

            <ul className="mt-6 space-y-2 flex-1">
              {(t.raw(`tiers.${card.key}.features`) as string[]).map((f, i) => (
                <li key={i} className="text-sm text-ink flex gap-2">
                  <span className="text-accent">—</span>
                  {f}
                </li>
              ))}
            </ul>

            {canSubscribe ? (
              <UpgradeButton
                tier={card.tierName as "PRO" | "PREMIUM"}
                userId={user!.id}
                email={user!.email}
                label={t("subscribe")}
                autoOpen={autoOpenPlan === card.key}
                className={`mt-6 text-center py-2.5 rounded-doc font-medium transition-colors w-full ${
                  card.highlighted
                    ? "bg-accent text-white hover:bg-accentDim"
                    : "border border-line text-ink hover:bg-paperDim"
                }`}
              />
            ) : (
              <Link
                href={user ? "/opportunities" : `/signup?plan=${card.key}`}
                className={`mt-6 text-center py-2.5 rounded-doc font-medium transition-colors ${
                  card.highlighted
                    ? "bg-accent text-white hover:bg-accentDim"
                    : "border border-line text-ink hover:bg-paperDim"
                }`}
              >
                {user ? t("goToApp") : t("getStarted")}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
