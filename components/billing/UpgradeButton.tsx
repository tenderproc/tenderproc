"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getPaddleClient, onPaddleCheckoutEvent } from "@/lib/paddleClient";
import { PADDLE_PRICE_IDS } from "@/lib/paddle";

export default function UpgradeButton({
  tier,
  className,
  label,
  userId,
  email,
  paddleCustomerId,
  autoOpen,
  betaPromoActive,
}: {
  tier: "PRO" | "PREMIUM";
  className?: string;
  label: string;
  userId: string;
  email?: string;
  /** The signed-in user's Paddle customer id (subscriptions.paddle_customer_id),
   * if they already have one — wires Paddle Retain via pwCustomer. Undefined
   * for a Free-tier user with no Paddle customer yet. */
  paddleCustomerId?: string;
  /** Opens the checkout once on mount — used when the user already chose
   * this plan before signing up (see PricingCards' autoOpenPlan). */
  autoOpen?: boolean;
  /** Whether the beta feedback promo still has slots left, per the pricing
   * page's own server-side check (getBetaPromoStatus). When true, this
   * component tries to reserve a slot (POST /api/billing/promo/reserve)
   * before opening checkout; eligibility (already redeemed, promo filled up
   * in the meantime) is re-checked there, server-side, right before the
   * discount is actually applied — this flag only decides whether it's
   * worth attempting that call at all. */
  betaPromoActive?: boolean;
}) {
  const t = useTranslations("UpgradeButton");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoOpened = useRef(false);

  async function reserveBetaPromoDiscount(): Promise<string | undefined> {
    try {
      const res = await fetch("/api/billing/promo/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) return undefined; // already redeemed / promo full / not configured — fall through to full price
      const data = await res.json();
      return data.discountId as string | undefined;
    } catch {
      return undefined; // network hiccup — don't block checkout over the promo
    }
  }

  async function subscribe() {
    setLoading(true);
    setError(null);
    try {
      const discountId = betaPromoActive ? await reserveBetaPromoDiscount() : undefined;
      const paddle = await getPaddleClient(paddleCustomerId);
      if (!paddle) throw new Error(t("couldNotStartCheckout"));

      // Checkout.open() resolves as soon as the overlay starts opening, not
      // once it's actually loaded and visible — on a slow connection the
      // overlay's own assets can take many seconds, during which the button
      // would otherwise silently drop back to normal and look inert (see
      // the QA audit's persona 2 finding: 20-30s of no feedback on a
      // throttled connection). Keep the loading state until Paddle reports
      // the checkout actually loaded (or failed/closed), with a timeout as
      // a safety net in case neither event ever arrives.
      await new Promise<void>((resolve) => {
        let settled = false;
        const timer = setTimeout(finish, 20000);
        const unsubscribe = onPaddleCheckoutEvent((event) => {
          if (
            event.name === "checkout.loaded" ||
            event.name === "checkout.error" ||
            event.name === "checkout.closed"
          ) {
            finish();
          }
        });
        function finish() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          unsubscribe();
          resolve();
        }
        paddle.Checkout.open({
          items: [{ priceId: PADDLE_PRICE_IDS[tier], quantity: 1 }],
          ...(discountId ? { discountId } : {}),
          customer: email ? { email } : undefined,
          customData: { supabase_user_id: userId },
          settings: {
            displayMode: "overlay",
            variant: "one-page",
            successUrl: `${window.location.origin}/billing/success`,
          },
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotStartCheckout"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoOpen && !autoOpened.current) {
      autoOpened.current = true;
      subscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  return (
    <div>
      <button onClick={subscribe} disabled={loading} className={className}>
        {loading ? t("opening") : label}
      </button>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
