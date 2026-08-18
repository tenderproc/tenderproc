import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "./SignOutButton";
import PrimaryNav from "./PrimaryNav";
import LocaleSwitcher from "./LocaleSwitcher";

export default async function Header() {
  const t = await getTranslations("Header");

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/tenderproc-logo.svg" alt="TenderProc" width={127} height={40} priority />
          <span className="text-[11px] font-medium uppercase tracking-wide text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
            Beta
          </span>
        </Link>
        <nav className="text-sm text-inkDim flex items-center gap-5">
          <span className="hidden sm:inline">{t("tagline")}</span>
          <LocaleSwitcher />
          <Link href="/pricing" className="hover:text-ink transition-colors">
            {t("pricing")}
          </Link>
          <Link href="/billing" className="hover:text-ink transition-colors">
            {t("billing")}
          </Link>
          <SignOutButton />
        </nav>
      </div>
      <PrimaryNav />
    </header>
  );
}
