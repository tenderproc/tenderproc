"use client";

import { useTranslations } from "next-intl";

/** Server-renderable (no hooks beyond next-intl) — app/pricing/page.tsx
 * queries getBetaPromoStatus itself and passes the result down, so this
 * component has no data fetching of its own and stays a plain function. */
export default function PromoBanner({ remaining }: { remaining: number }) {
  const t = useTranslations("BetaPromo.banner");
  if (remaining <= 0) return null;

  const key = remaining <= 5 ? "lastSpots" : "active";

  return (
    <div className="mb-8 text-center text-sm font-medium text-accent bg-accent/10 border border-accent/25 rounded-doc px-4 py-2.5 max-w-xl mx-auto">
      {t(key, { remaining })}
    </div>
  );
}
