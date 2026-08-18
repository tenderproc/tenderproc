import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import PricingCards from "@/components/billing/PricingCards";
import { getEffectiveTier, rowToUserSubscription, SUBSCRIPTION_COLUMNS } from "@/lib/billing/tiers";
import { PRICING_TIERS } from "@/lib/billing/pricingTiers";
import type { Tier as TierName } from "@/lib/billing/types";

export const dynamic = "force-dynamic";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
  const autoOpenPlan = params.plan === "pro" || params.plan === "premium" ? params.plan : undefined;
  const t = await getTranslations("Pricing");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Vercel sets this on every request; PricePreview falls back to its own
  // IP-based geolocation when it's absent (different host, or local dev),
  // so there's no in-app fallback/sentinel to maintain here.
  const countryCode = (await headers()).get("x-vercel-ip-country") ?? undefined;

  let currentTier: TierName = "FREE";
  if (user) {
    const { data: row } = await supabase
      .from("subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle();
    currentTier = getEffectiveTier(rowToUserSubscription(row)).tier;
  }

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-display font-semibold text-xl text-ink tracking-tight">
              TenderProc
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
              Beta
            </span>
          </Link>
          <nav className="text-sm text-inkDim flex items-center gap-5">
            <LocaleSwitcher />
            {user ? (
              <Link href="/opportunities" className="hover:text-ink transition-colors">
                {t("goToApp")} →
              </Link>
            ) : (
              <>
                <Link href="/login" className="hover:text-ink transition-colors">
                  {t("logIn")}
                </Link>
                <Link
                  href="/signup"
                  className="bg-accent text-white px-3 py-1.5 rounded-doc font-medium hover:bg-accentDim transition-colors"
                >
                  {t("signUp")}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
            {t("eyebrow")}
          </p>
          <h1 className="font-display font-bold text-4xl text-ink mt-2 tracking-tight">
            {t("heading")}
          </h1>
          <p className="text-sm text-inkDim mt-3 max-w-xl mx-auto leading-relaxed">
            {t("subheading")}
          </p>
        </div>

        <PricingCards
          paidTiers={PRICING_TIERS}
          countryCode={countryCode}
          currentTier={currentTier}
          user={user ? { id: user.id, email: user.email ?? undefined } : null}
          autoOpenPlan={autoOpenPlan}
        />
      </main>
    </div>
  );
}
