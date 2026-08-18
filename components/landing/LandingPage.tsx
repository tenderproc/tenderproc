import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { PRICING_TIERS } from "@/lib/billing/pricingTiers";

interface Tier {
  key: string;
  price: string;
  hasPeriod: boolean;
  highlighted?: boolean;
}

const TIERS: Tier[] = [
  { key: "free", price: "€0", hasPeriod: false },
  ...PRICING_TIERS.map((tier) => ({
    key: tier.key,
    price: tier.basePrice,
    hasPeriod: true,
    highlighted: tier.highlighted,
  })),
];

export default async function LandingPage() {
  const t = await getTranslations("Landing");
  const tPricing = await getTranslations("Pricing");

  const features = t.raw("features.items") as { tier: string; title: string; description: string }[];
  const steps = t.raw("howItWorks.steps") as { title: string; description: string }[];

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/tenderproc-logo.svg" alt="TenderProc" width={127} height={40} priority />
            <span className="text-[11px] font-medium uppercase tracking-wide text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
              Beta
            </span>
          </Link>
          <nav className="text-sm text-inkDim flex items-center gap-5">
            <LocaleSwitcher />
            <Link href="/pricing" className="hover:text-ink transition-colors">
              {tPricing("eyebrow")}
            </Link>
            <Link href="/login" className="hover:text-ink transition-colors">
              {t("hero.ctaSecondary")}
            </Link>
            <Link
              href="/signup"
              className="bg-accent text-white px-3 py-1.5 rounded-doc font-medium hover:bg-accentDim transition-colors"
            >
              {t("hero.ctaPrimary")}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
            {t("hero.eyebrow")}
          </p>
          <h1 className="font-display font-bold text-4xl sm:text-5xl text-ink mt-4 tracking-tight leading-tight max-w-3xl mx-auto">
            {t("hero.headline")}
          </h1>
          <p className="text-base sm:text-lg text-inkDim mt-5 max-w-xl mx-auto leading-relaxed">
            {t("hero.subheading")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto text-center bg-accent text-white px-6 py-3 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors"
            >
              {t("hero.ctaPrimary")}
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto text-center border border-line px-6 py-3 rounded-doc font-medium text-ink hover:bg-paperDim transition-colors"
            >
              {t("hero.ctaSecondary")}
            </Link>
          </div>
        </section>

        {/* Problem */}
        <section className="border-y border-line bg-paperDim">
          <div className="max-w-3xl mx-auto px-6 py-16 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
              {t("problem.eyebrow")}
            </p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mt-3 tracking-tight">
              {t("problem.heading")}
            </h2>
            <p className="text-sm sm:text-base text-inkDim mt-4 leading-relaxed">
              {t("problem.body")}
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
              {t("features.eyebrow")}
            </p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mt-3 tracking-tight">
              {t("features.heading")}
            </h2>
            <p className="text-sm text-inkDim mt-3 max-w-xl mx-auto leading-relaxed">
              {t("features.subheading")}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div
                key={i}
                className="border border-line bg-white rounded-2xl p-6 flex flex-col"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-semibold text-lg text-ink">{f.title}</h3>
                  <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
                    {f.tier}
                  </span>
                </div>
                <p className="text-sm text-inkDim mt-2 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-line bg-paperDim">
          <div className="max-w-5xl mx-auto px-6 py-20">
            <div className="text-center mb-12">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
                {t("howItWorks.eyebrow")}
              </p>
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mt-3 tracking-tight">
                {t("howItWorks.heading")}
              </h2>
            </div>

            <div className="grid sm:grid-cols-3 gap-8">
              {steps.map((s, i) => (
                <div key={i} className="text-center sm:text-left">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent text-white font-display font-semibold text-sm">
                    {i + 1}
                  </span>
                  <h3 className="font-display font-semibold text-lg text-ink mt-4">{s.title}</h3>
                  <p className="text-sm text-inkDim mt-2 leading-relaxed">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
              {t("pricingSection.eyebrow")}
            </p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink mt-3 tracking-tight">
              {t("pricingSection.heading")}
            </h2>
            <p className="text-sm text-inkDim mt-3 max-w-xl mx-auto leading-relaxed">
              {t("pricingSection.subheading")}
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {TIERS.map((tier) => (
              <div
                key={tier.key}
                className={`rounded-2xl p-6 flex flex-col ${
                  tier.highlighted
                    ? "border-2 border-accent bg-accent/5 shadow-sm relative"
                    : "border border-line bg-white"
                }`}
              >
                {tier.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-semibold uppercase tracking-wide text-white bg-accent rounded-full px-3 py-1">
                    {tPricing("mostPopular")}
                  </span>
                )}
                <h3 className="font-display font-semibold text-xl text-ink">
                  {tPricing(`tiers.${tier.key}.name`)}
                </h3>
                <p className="text-sm text-inkDim mt-1">{tPricing(`tiers.${tier.key}.blurb`)}</p>
                <p className="mt-5">
                  <span className="font-display font-bold text-3xl text-ink">{tier.price}</span>
                  <span className="text-sm text-inkDim">{tier.hasPeriod ? tPricing("perMonth") : ""}</span>
                </p>
                <ul className="mt-6 space-y-2 flex-1">
                  {(tPricing.raw(`tiers.${tier.key}.features`) as string[]).map((f, i) => (
                    <li key={i} className="text-sm text-ink flex gap-2">
                      <span className="text-accent">—</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="text-center mt-8">
            <Link href="/pricing" className="text-sm text-ink underline underline-offset-4">
              {t("pricingSection.viewFullPricing")}
            </Link>
          </p>
        </section>

        {/* Final CTA */}
        <section className="border-t border-line bg-ink">
          <div className="max-w-2xl mx-auto px-6 py-16 text-center">
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-white tracking-tight">
              {t("finalCta.heading")}
            </h2>
            <p className="text-sm sm:text-base text-white/70 mt-3 leading-relaxed">
              {t("finalCta.subheading")}
            </p>
            <Link
              href="/signup"
              className="inline-block mt-7 bg-accent text-white px-6 py-3 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors"
            >
              {t("finalCta.cta")}
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <span className="font-display font-semibold text-ink tracking-tight">TenderProc</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
                Beta
              </span>
            </div>
            <p className="text-xs text-inkDim mt-2 max-w-xs">{t("footer.tagline")}</p>
          </div>

          <nav className="flex items-center gap-6 text-sm text-inkDim">
            <Link href="/pricing" className="hover:text-ink transition-colors">
              {t("footer.pricing")}
            </Link>
            <Link href="/login" className="hover:text-ink transition-colors">
              {t("footer.logIn")}
            </Link>
            <Link href="/signup" className="hover:text-ink transition-colors">
              {t("footer.signUp")}
            </Link>
          </nav>
        </div>
        <div className="border-t border-line">
          <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-inkDim">
              {t("footer.rights", { year: new Date().getFullYear() })}
            </p>
            <nav className="flex items-center gap-4 text-xs text-inkDim">
              <Link href="/terms" className="hover:text-ink transition-colors">
                {t("footer.terms")}
              </Link>
              <Link href="/privacy" className="hover:text-ink transition-colors">
                {t("footer.privacy")}
              </Link>
              <Link href="/refund" className="hover:text-ink transition-colors">
                {t("footer.refund")}
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
