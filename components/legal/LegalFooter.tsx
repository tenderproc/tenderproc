import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function LegalFooter() {
  const t = await getTranslations("Legal");

  return (
    <footer className="border-t border-line mt-16">
      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link href="/" className="text-sm text-inkDim hover:text-ink transition-colors">
          ← {t("backToTenderProc")}
        </Link>
        <nav className="flex items-center gap-5 text-sm text-inkDim">
          <Link href="/terms" className="hover:text-ink transition-colors">
            {t("terms")}
          </Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">
            {t("privacy")}
          </Link>
          <Link href="/refund" className="hover:text-ink transition-colors">
            {t("refund")}
          </Link>
          <Link href="/contact" className="hover:text-ink transition-colors">
            {t("contact")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
