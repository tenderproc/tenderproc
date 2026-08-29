import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import LegalHeader from "@/components/legal/LegalHeader";
import LegalFooter from "@/components/legal/LegalFooter";
import { legalStyles as s } from "@/components/legal/legalStyles";
import { LEGAL_ENTITY, LEGAL_DATES } from "@/lib/legal/companyInfo";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

export const metadata = { title: "Terms of Service — TenderProc" };

const strong = (chunks: React.ReactNode) => <strong className={s.strong}>{chunks}</strong>;

export default async function TermsPage() {
  const t = await getTranslations("Terms");
  const tLegal = await getTranslations("Legal");
  const locale = (await getLocale()) as Locale;
  const lastUpdated = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(LEGAL_DATES.lastUpdated);

  const values = {
    entityName: LEGAL_ENTITY.name,
    companyNumber: LEGAL_ENTITY.companyNumber,
    jurisdiction: LEGAL_ENTITY.jurisdiction,
    emailAddress: LEGAL_ENTITY.contactEmail,
  };

  return (
    <div>
      <LegalHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">{tLegal("eyebrow")}</p>
        <h1 className="font-display font-bold text-4xl text-ink mt-2 tracking-tight">{t("title")}</h1>
        <p className="text-sm text-inkDim mt-3">{tLegal("lastUpdated", { date: lastUpdated })}</p>

        <p className={s.p}>{t.rich("intro", { ...values, strong })}</p>

        <h2 className={s.h2}>{t("s1.h")}</h2>
        <p className={s.p}>{t("s1.p1")}</p>
        <p className={s.p}>{t.rich("s1.p2", { strong })}</p>

        <h2 className={s.h2}>{t("s2.h")}</h2>
        <p className={s.p}>{t("s2.p1")}</p>

        <h2 className={s.h2}>{t("s3.h")}</h2>
        <p className={s.p}>{t.rich("s3.p1", { strong })}</p>
        <p className={s.p}>
          {t.rich("s3.p2", {
            refundLink: (chunks) => (
              <Link href="/refund" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <p className={s.p}>{t("s3.p3")}</p>

        <h2 className={s.h2}>{t("s4.h")}</h2>
        <p className={s.p}>{t("s4.intro")}</p>
        <ul className={s.ul}>
          <li>{t("s4.li1")}</li>
          <li>{t("s4.li2")}</li>
          <li>{t("s4.li3")}</li>
          <li>{t("s4.li4")}</li>
          <li>{t("s4.li5")}</li>
          <li>{t("s4.li6")}</li>
        </ul>

        <h2 className={s.h2}>{t("s5.h")}</h2>
        <p className={s.p}>
          {t.rich("s5.p1", {
            strong,
            privacyLink: (chunks) => (
              <Link href="/privacy" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>

        <h2 className={s.h2}>{t("s6.h")}</h2>
        <p className={s.p}>{t("s6.p1")}</p>

        <h2 className={s.h2}>{t("s7.h")}</h2>
        <p className={s.p}>{t("s7.p1", values)}</p>

        <h2 className={s.h2}>{t("s8.h")}</h2>
        <p className={s.p}>{t("s8.p1")}</p>

        <h2 className={s.h2}>{t("s9.h")}</h2>
        <p className={s.p}>{t("s9.p1")}</p>

        <h2 className={s.h2}>{t("s10.h")}</h2>
        <p className={s.p}>{t("s10.p1")}</p>

        <h2 className={s.h2}>{t("s11.h")}</h2>
        <p className={s.p}>{t("s11.p1")}</p>

        <h2 className={s.h2}>{t("s12.h")}</h2>
        <p className={s.p}>{t("s12.p1", values)}</p>

        <h2 className={s.h2}>{t("s13.h")}</h2>
        <p className={s.p}>
          {t.rich("s13.p1", {
            ...values,
            email: (chunks) => <a href={`mailto:${LEGAL_ENTITY.contactEmail}`}>{chunks}</a>,
          })}
        </p>
      </main>
      <LegalFooter />
    </div>
  );
}
