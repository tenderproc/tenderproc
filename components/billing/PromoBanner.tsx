"use client";

import { useTranslations } from "next-intl";

/** Server-renderable (no hooks beyond next-intl) — app/pricing/page.tsx
 * queries getBetaPromoStatus itself and passes the result down, so this
 * component has no data fetching of its own and stays a plain function.
 * Deliberately doesn't surface the remaining-slots count or the 20-subscriber
 * cap in the copy — `active` is the only signal shown to visitors; the real
 * enforcement (20 total, one per customer) still happens server-side
 * regardless of what the banner says. */
export default function PromoBanner({ active }: { active: boolean }) {
  const t = useTranslations("BetaPromo.banner");
  if (!active) return null;

  return (
    <div className="mb-8 text-center text-sm font-medium text-accent bg-accent/10 border border-accent/25 rounded-doc px-4 py-2.5 max-w-xl mx-auto">
      {t("active")}
    </div>
  );
}
