"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getPaddleClient } from "@/lib/paddleClient";
import { PADDLE_PRICE_IDS } from "@/lib/paddle";

export default function UpgradeButton({
  tier,
  className,
  label,
  userId,
  email,
  autoOpen,
}: {
  tier: "PRO" | "PREMIUM";
  className?: string;
  label: string;
  userId: string;
  email?: string;
  /** Opens the checkout once on mount — used when the user already chose
   * this plan before signing up (see PricingCards' autoOpenPlan). */
  autoOpen?: boolean;
}) {
  const t = useTranslations("UpgradeButton");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoOpened = useRef(false);

  async function subscribe() {
    setLoading(true);
    setError(null);
    try {
      const paddle = await getPaddleClient();
      if (!paddle) throw new Error(t("couldNotStartCheckout"));
      paddle.Checkout.open({
        items: [{ priceId: PADDLE_PRICE_IDS[tier], quantity: 1 }],
        customer: email ? { email } : undefined,
        customData: { supabase_user_id: userId },
        settings: {
          displayMode: "overlay",
          variant: "one-page",
          successUrl: `${window.location.origin}/billing/success`,
        },
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
