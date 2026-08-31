"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

function noopSubscribe() {
  return () => {};
}

// Shown only while the signed-in user has no profile signal yet (see
// hasProfileSignal in lib/scoring.ts, gated server-side in
// app/opportunities/page.tsx) — it stops appearing on its own once they've
// filled in a sector/description/address, so a dismiss is only needed for
// someone who wants it gone before then.
export default function OnboardingBanner({ userId }: { userId: string }) {
  const t = useTranslations("Opportunities");
  const storageKey = `onboardingBannerDismissed:${userId}`;
  // useSyncExternalStore (not useState+useEffect) reads localStorage without
  // a setState-in-effect cascade; getServerSnapshot defaults to "not
  // dismissed" so SSR always renders the banner for a genuinely new visitor.
  const previouslyDismissed = useSyncExternalStore(
    noopSubscribe,
    () => localStorage.getItem(storageKey) === "1",
    () => false
  );
  const [justDismissed, setJustDismissed] = useState(false);

  if (previouslyDismissed || justDismissed) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-doc border border-accent/20 bg-accent/5 px-4 py-3">
      <p className="flex-1 text-sm text-ink leading-relaxed">
        {t("onboardingText")}{" "}
        <Link
          href="/company"
          className="font-medium text-accent underline underline-offset-2 hover:text-accentDim"
        >
          {t("onboardingLinkLabel")}
        </Link>
      </p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(storageKey, "1");
          setJustDismissed(true);
        }}
        aria-label={t("onboardingDismissLabel")}
        className="px-1 text-lg leading-none text-inkDim hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
