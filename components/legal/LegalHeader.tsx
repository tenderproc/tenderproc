import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { DEFAULT_LOCALE, type Locale } from "@/lib/locales";

/** Shared chrome for /terms, /privacy, /refund, /contact — public pages,
 * same header pattern as app/pricing/page.tsx. /terms, /privacy and /refund
 * are translated into every supported locale, but English is the
 * authoritative text — on a non-English locale this renders a disclaimer
 * below the nav saying the English version prevails in case of
 * inconsistency (see Legal.englishOnlyNotice). /contact has no legal
 * force, so it opts out of the disclaimer via showEnglishNotice={false}. */
export default async function LegalHeader({
  showEnglishNotice = true,
}: {
  showEnglishNotice?: boolean;
}) {
  const t = await getTranslations("Legal");
  const tHeader = await getTranslations("Header");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper">
      <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display font-semibold text-xl text-ink tracking-tight">TenderProc</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
            Beta
          </span>
        </Link>
        <nav className="text-sm text-inkDim flex items-center gap-5">
          <LocaleSwitcher />
          <Link href="/pricing" className="hover:text-ink transition-colors">
            {tHeader("pricing")}
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
      </div>
      {showEnglishNotice && locale !== DEFAULT_LOCALE && (
        <div className="bg-paperDim border-t border-line">
          <div className="max-w-3xl mx-auto px-6 py-2">
            <p className="text-xs text-inkDim">{t("englishOnlyNotice")}</p>
          </div>
        </div>
      )}
    </header>
  );
}
