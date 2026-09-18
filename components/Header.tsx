import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import SignOutButton from "./SignOutButton";
import PrimaryNav from "./PrimaryNav";
import LocaleSwitcher from "./LocaleSwitcher";
import MobileMenu from "./MobileMenu";
import { createClient } from "@/lib/supabase/server";
import { peekTokens } from "@/lib/billing/tokens";

export default async function Header() {
  const t = await getTranslations("Header");
  const tA11y = await getTranslations("Accessibility");
  const tLegal = await getTranslations("Legal");
  const tBilling = await getTranslations("BillingPage");

  // Free-tier users have no other persistent way to see how close they are
  // to the monthly AI token ceiling before hitting it (previously only
  // visible on the Billing page itself — see the QA audit's "no visible
  // quota indicator" finding). PRO/PREMIUM are unlimited and never see this.
  let tokenBadge: string | null = null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const status = await peekTokens(user.id);
    if (!status.unlimited) tokenBadge = tBilling("tokensRemaining", { count: status.balance });
  }

  return (
    <>
      {/* First focusable element on every page that renders this Header —
          lets keyboard/screen-reader users bypass the logo, token badge,
          locale switcher, and nav links below and jump straight to
          `#main-content` (see the QA audit's "no skip-to-content link,
          WCAG 2.4.1" finding). Visually hidden until it receives focus. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-accent focus:text-white focus:px-4 focus:py-2 focus:rounded-doc focus:text-sm focus:font-medium"
      >
        {tA11y("skipToContent")}
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-paper">
      <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-y-2">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/tenderproc-logo.svg" alt="TenderProc" width={165} height={52} priority />
          <span className="text-[11px] font-medium uppercase tracking-wide text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
            Beta
          </span>
        </Link>
        <nav className="hidden md:flex text-sm text-inkDim items-center gap-5">
          <span className="hidden lg:inline">{t("tagline")}</span>
          {tokenBadge && (
            <Link href="/billing" className="text-xs text-inkDim hover:text-ink transition-colors">
              {tokenBadge}
            </Link>
          )}
          <LocaleSwitcher />
          <Link href="/pricing" className="hover:text-ink transition-colors">
            {t("pricing")}
          </Link>
          <Link href="/billing" className="hover:text-ink transition-colors">
            {t("billing")}
          </Link>
          <Link href="/contact" className="hover:text-ink transition-colors">
            {tLegal("contact")}
          </Link>
          <SignOutButton />
        </nav>
        <MobileMenu tokenBadge={tokenBadge} />
      </div>
      <PrimaryNav />
      </header>
    </>
  );
}
