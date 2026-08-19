import { getTranslations } from "next-intl/server";
import LegalHeader from "@/components/legal/LegalHeader";
import LegalFooter from "@/components/legal/LegalFooter";
import ContactForm from "@/components/ContactForm";
import FaqAccordion from "@/components/FaqAccordion";
import { LEGAL_ENTITY } from "@/lib/legal/companyInfo";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategoryRaw {
  title: string;
  items: FaqItem[];
}

export default async function ContactPage() {
  const t = await getTranslations("Contact");

  const rawCategories = t.raw("faq.categories") as Record<string, FaqCategoryRaw>;
  const categories = Object.entries(rawCategories).map(([key, category]) => ({
    key,
    title: category.title,
    items: category.items,
  }));

  return (
    <div>
      <LegalHeader />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">{t("eyebrow")}</p>
          <h1 className="font-display font-bold text-3xl sm:text-4xl mt-2 text-ink tracking-tight">
            {t("heading")}
          </h1>
          <p className="text-sm sm:text-base text-inkDim mt-3 max-w-xl mx-auto leading-relaxed">
            {t("subheading")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <ContactForm />

          <div className="border border-line bg-paperDim rounded-2xl p-6 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-inkDim">{t("info.emailLabel")}</p>
            <a href={`mailto:${LEGAL_ENTITY.contactEmail}`} className="block text-lg text-ink font-medium">
              {LEGAL_ENTITY.contactEmail}
            </a>
            <p className="text-sm text-inkDim leading-relaxed pt-2">{t("info.replyTime")}</p>
          </div>
        </div>

        <div className="mt-20">
          <h2 className="font-display font-semibold text-2xl text-ink tracking-tight mb-6 text-center">
            {t("faq.heading")}
          </h2>
          <FaqAccordion categories={categories} />
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
