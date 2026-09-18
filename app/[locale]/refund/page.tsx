import { getLocale, getTranslations } from "next-intl/server";
import LegalHeader from "@/components/legal/LegalHeader";
import LegalFooter from "@/components/legal/LegalFooter";
import { legalStyles as s } from "@/components/legal/legalStyles";
import { LEGAL_ENTITY, LEGAL_DATES } from "@/lib/legal/companyInfo";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

export const metadata = { title: "Refund Policy — TenderProc" };

const strong = (chunks: React.ReactNode) => <strong className={s.strong}>{chunks}</strong>;

export default async function RefundPage() {
  const t = await getTranslations("Refund");
  const tLegal = await getTranslations("Legal");
  const locale = (await getLocale()) as Locale;
  const lastUpdated = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(LEGAL_DATES.lastUpdated);

  const email = (chunks: React.ReactNode) => <a href={`mailto:${LEGAL_ENTITY.contactEmail}`}>{chunks}</a>;
  const values = { emailAddress: LEGAL_ENTITY.contactEmail };

  return (
    <div>
      <LegalHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">{tLegal("eyebrow")}</p>
        <h1 className="font-display font-bold text-4xl text-ink mt-2 tracking-tight">{t("title")}</h1>
        <p className="text-sm text-inkDim mt-3">{tLegal("lastUpdated", { date: lastUpdated })}</p>

        <h2 className={s.h2}>{t("s1.h")}</h2>
        <p className={s.p}>{t.rich("s1.p1", { strong })}</p>

        <h2 className={s.h2}>{t("s2.h")}</h2>
        <p className={s.p}>{t.rich("s2.p1", { ...values, strong, email })}</p>

        <h2 className={s.h2}>{t("s3.h")}</h2>
        <ul className={s.ul}>
          <li>{t("s3.li1")}</li>
          <li>{t("s3.li2")}</li>
          <li>{t("s3.li3")}</li>
        </ul>

        <h2 className={s.h2}>{t("s4.h")}</h2>
        <p className={s.p}>{t("s4.p1")}</p>

        <h2 className={s.h2}>{t("s5.h")}</h2>
        <p className={s.p}>{t("s5.p1")}</p>

        <h2 className={s.h2}>{t("s6.h")}</h2>
        <p className={s.p}>{t("s6.p1")}</p>

        <h2 className={s.h2}>{t("s7.h")}</h2>
        <p className={s.p}>{t("s7.p1")}</p>

        <h2 className={s.h2}>{t("s8.h")}</h2>
        <p className={s.p}>{t.rich("s8.p1", { ...values, email })}</p>
      </main>
      <LegalFooter />
    </div>
  );
}
