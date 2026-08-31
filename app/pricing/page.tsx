import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import LegalFooter from "@/components/legal/LegalFooter";
import PricingCards from "@/components/billing/PricingCards";
import PricingMobileMenu from "@/components/billing/PricingMobileMenu";
import PromoBanner from "@/components/billing/PromoBanner";
import { getEffectiveTier, rowToUserSubscription, SUBSCRIPTION_COLUMNS } from "@/lib/billing/tiers";
import { PRICING_TIERS } from "@/lib/billing/pricingTiers";
import { getBetaPromoStatus } from "@/lib/billing/betaPromo";
import type { Tier as TierName } from "@/lib/billing/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.pricing");
  return { title: t("title"), description: t("description") };
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
  const autoOpenPlan = params.plan === "pro" || params.plan === "premium" ? params.plan : undefined;
  const t = await getTranslations("Pricing");
  const tLegal = await getTranslations("Legal");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Vercel sets this on every request; PricePreview falls back to its own
  // IP-based geolocation when it's absent (different host, or local dev),
  // so there's no in-app fallback/sentinel to maintain here.
  const countryCode = (await headers()).get("x-vercel-ip-country") ?? undefined;

  let currentTier: TierName = "FREE";
  let paddleCustomerId: string | undefined;
  if (user) {
    const { data: row } = await supabase
      .from("subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle();
    const subscription = rowToUserSubscription(row);
    currentTier = getEffectiveTier(subscription).tier;
    paddleCustomerId = subscription.paddleCustomerId ?? undefined;
  }

  // Read from our own DB rather than Paddle's discount usage directly — the
  // count needs to reflect in-flight reservations immediately and avoid
  // rate-limiting Paddle's API on every pricing-page view.
  const betaPromo = await getBetaPromoStatus(createAdminClient());

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-y-2">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/tenderproc-logo.svg" alt="TenderProc" width={127} height={40} priority />
            <span className="text-[11px] font-medium uppercase tracking-wide text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
              Beta
            </span>
          </Link>
          <nav className="hidden md:flex text-sm text-inkDim items-center gap-5">
            <LocaleSwitcher />
            <Link href="/contact" className="hover:text-ink transition-colors">
              {tLegal("contact")}
            </Link>
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
          <PricingMobileMenu isLoggedIn={Boolean(user)} />
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

        <PromoBanner active={betaPromo.active} />

        <PricingCards
          paidTiers={PRICING_TIERS}
          countryCode={countryCode}
          currentTier={currentTier}
          user={user ? { id: user.id, email: user.email ?? undefined } : null}
          paddleCustomerId={paddleCustomerId}
          autoOpenPlan={autoOpenPlan}
          betaPromoActive={betaPromo.active}
        />
      </main>
      <LegalFooter />
    </div>
  );
}
