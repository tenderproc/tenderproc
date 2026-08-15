import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import LocaleSwitcher from "@/components/LocaleSwitcher";

export const dynamic = "force-dynamic";

interface Tier {
  key: string;
  price: string;
  hasPeriod: boolean;
  highlighted?: boolean;
}

const TIERS: Tier[] = [
  { key: "free", price: "€0", hasPeriod: false },
  { key: "pro", price: "€49", hasPeriod: true, highlighted: true },
  { key: "premium", price: "€79", hasPeriod: true },
];

export default async function PricingPage() {
  const t = await getTranslations("Pricing");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
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
                  {t("mostPopular")}
                </span>
              )}
              <h2 className="font-display font-semibold text-xl text-ink">
                {t(`tiers.${tier.key}.name`)}
              </h2>
              <p className="text-sm text-inkDim mt-1">{t(`tiers.${tier.key}.blurb`)}</p>
              <p className="mt-5">
                <span className="font-display font-bold text-3xl text-ink">{tier.price}</span>
                <span className="text-sm text-inkDim">{tier.hasPeriod ? t("perMonth") : ""}</span>
              </p>

              <ul className="mt-6 space-y-2 flex-1">
                {(t.raw(`tiers.${tier.key}.features`) as string[]).map((f, i) => (
                  <li key={i} className="text-sm text-ink flex gap-2">
                    <span className="text-accent">—</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={user ? "/opportunities" : "/signup"}
                className={`mt-6 text-center py-2.5 rounded-doc font-medium transition-colors ${
                  tier.highlighted
                    ? "bg-accent text-white hover:bg-accentDim"
                    : "border border-line text-ink hover:bg-paperDim"
                }`}
              >
                {user ? t("goToApp") : t("getStarted")}
              </Link>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
