import { getLocale, getTranslations } from "next-intl/server";
import LegalHeader from "@/components/legal/LegalHeader";
import LegalFooter from "@/components/legal/LegalFooter";
import { legalStyles as s } from "@/components/legal/legalStyles";
import { LEGAL_ENTITY, LEGAL_DATES } from "@/lib/legal/companyInfo";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

export const metadata = { title: "Privacy Notice — TenderProc" };

const strong = (chunks: React.ReactNode) => <strong className={s.strong}>{chunks}</strong>;

export default async function PrivacyPage() {
  const t = await getTranslations("Privacy");
  const tLegal = await getTranslations("Legal");
  const locale = (await getLocale()) as Locale;
  const lastUpdated = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(LEGAL_DATES.lastUpdated);

  // LEGAL_ENTITY.supabaseRegion is the canonical English record ("Singapore
  // (AWS ap-southeast-1)"); French and German spell/inflect the place name
  // differently, so translated pages get a locale-appropriate label instead
  // of the raw English string.
  const supabaseRegionLabel: Record<Locale, string> = {
    en: LEGAL_ENTITY.supabaseRegion,
    fr: "Singapour (AWS ap-southeast-1)",
    nl: LEGAL_ENTITY.supabaseRegion,
    de: "Singapur (AWS ap-southeast-1)",
  };

  const values = {
    entityName: LEGAL_ENTITY.name,
    companyNumber: LEGAL_ENTITY.companyNumber,
    supabaseRegion: supabaseRegionLabel[locale],
    emailAddress: LEGAL_ENTITY.contactEmail,
  };
  const email = (chunks: React.ReactNode) => <a href={`mailto:${LEGAL_ENTITY.contactEmail}`}>{chunks}</a>;

  return (
    <div>
      <LegalHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">{tLegal("eyebrow")}</p>
        <h1 className="font-display font-bold text-4xl text-ink mt-2 tracking-tight">{t("title")}</h1>
        <p className="text-sm text-inkDim mt-3">{tLegal("lastUpdated", { date: lastUpdated })}</p>

        <p className={s.p}>{t("intro")}</p>

        <h2 className={s.h2}>{t("s1.h")}</h2>
        <p className={s.p}>{t.rich("s1.p1", { ...values, strong, email })}</p>
        <p className={s.p}>{t("s1.p2")}</p>

        <h2 className={s.h2}>{t("s2.h")}</h2>
        <p className={s.p}>{t.rich("s2.p1", { strong })}</p>
        <p className={s.p}>{t.rich("s2.p2", { strong })}</p>
        <p className={s.p}>{t.rich("s2.p3", { strong })}</p>
        <p className={s.p}>{t.rich("s2.p4", { strong })}</p>
        <p className={s.p}>{t.rich("s2.p5", { strong })}</p>

        <h2 className={s.h2}>{t("s3.h")}</h2>
        <ul className={s.ul}>
          <li>{t.rich("s3.li1", { strong })}</li>
          <li>{t.rich("s3.li2", { strong })}</li>
          <li>{t.rich("s3.li3", { strong })}</li>
          <li>{t.rich("s3.li4", { strong })}</li>
          <li>{t.rich("s3.li5", { strong })}</li>
        </ul>
        <p className={s.p}>{t("s3.p1")}</p>

        <h2 className={s.h2}>{t("s4.h")}</h2>
        <p className={s.p}>{t("s4.intro")}</p>
        <ul className={s.ul}>
          <li>{t.rich("s4.li1", { ...values, strong })}</li>
          <li>{t.rich("s4.li2", { strong })}</li>
          <li>{t.rich("s4.li3", { strong })}</li>
          <li>{t.rich("s4.li4", { strong })}</li>
        </ul>
        <p className={s.p}>{t("s4.p1")}</p>
        <p className={s.p}>{t("s4.p2")}</p>

        <h2 className={s.h2}>{t("s5.h")}</h2>
        <p className={s.p}>{t.rich("s5.p1", { ...values, email })}</p>

        <h2 className={s.h2}>{t("s6.h")}</h2>
        <p className={s.p}>{t("s6.p1")}</p>

        <h2 className={s.h2}>{t("s7.h")}</h2>
        <p className={s.p}>{t("s7.intro")}</p>
        <ul className={s.ul}>
          <li>{t("s7.li1")}</li>
          <li>{t("s7.li2")}</li>
          <li>{t("s7.li3")}</li>
          <li>{t("s7.li4")}</li>
          <li>{t("s7.li5")}</li>
          <li>{t("s7.li6")}</li>
          <li>{t("s7.li7")}</li>
        </ul>
        <p className={s.p}>{t.rich("s7.p1", { ...values, email })}</p>

        <h2 className={s.h2}>{t("s8.h")}</h2>
        <p className={s.p}>{t("s8.p1")}</p>

        <h2 className={s.h2}>{t("s9.h")}</h2>
        <p className={s.p}>{t("s9.p1")}</p>

        <h2 className={s.h2}>{t("s10.h")}</h2>
        <p className={s.p}>{t("s10.p1")}</p>

        <h2 className={s.h2}>{t("s11.h")}</h2>
        <p className={s.p}>{t("s11.p1")}</p>
      </main>
      <LegalFooter />
    </div>
  );
}
