import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import UploadAnalyzer from "@/components/UploadAnalyzer";
import AddToWorkflowButton from "@/components/AddToWorkflowButton";
import TenderOverview from "@/components/tenders/TenderOverview";
import TenderDocumentLinks from "@/components/tenders/TenderDocumentLinks";
import { getTenderById } from "@/lib/tenders/getTenderById";
import { createClient } from "@/lib/supabase/server";
import { getMatchScores } from "@/lib/matchScoreCache";
import { getSavedCompanyProfile } from "@/lib/companyProfile";
import type { Locale } from "@/lib/locales";

export const dynamic = "force-dynamic";

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("PublicTenderDetail");
  const locale = (await getLocale()) as Locale;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // getSavedCompanyProfile reads the current schema's singular `language`
  // column (see supabase-language-filter-single-select-migration.sql, which
  // dropped the old plural `languages` column this page used to hand-roll a
  // query against — that query silently failed for every user, since its
  // error was never checked, so this page always rendered as if the user
  // had no company profile at all: default title-language priority and no
  // match score, regardless of their real sectors/language preference).
  let languageKeys: string[] | undefined;
  let sectors: string[] = [];
  let companyDescription = "";
  let address = "";
  let companySize = "";
  if (user) {
    const saved = await getSavedCompanyProfile(supabase, user.id);
    languageKeys = saved.savedLanguage ? [saved.savedLanguage] : undefined;
    sectors = saved.savedSectors;
    companyDescription = saved.profile.description;
    address = saved.profile.address;
    companySize = saved.profile.companySize;
  }

  const tender = await getTenderById(decodeURIComponent(id), languageKeys);
  if (!tender) notFound();

  let score = undefined;
  if (user) {
    const scores = await getMatchScores(
      supabase,
      user.id,
      [tender],
      {
        sectors,
        languages: languageKeys ?? [],
        description: companyDescription,
        address,
        companySize,
      },
      locale
    );
    score = scores[tender.publicationNumber];
  }

  return (
    <div>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/opportunities" className="text-sm text-inkDim hover:text-ink">
          ← {t("backToOpenTenders")}
        </Link>

        <div className="mt-6 mb-8">
          <TenderOverview tender={tender} score={score} />

          <div className="flex items-center justify-between gap-4 flex-wrap mt-6">
            <a
              href={tender.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent underline"
            >
              {t("viewOriginalNotice", { source: tender.sourceName })} →
            </a>
            <AddToWorkflowButton publicationNumber={tender.publicationNumber} />
          </div>

          <div className="mt-4">
            <TenderDocumentLinks urls={tender.documentUrls} />
          </div>
        </div>

        <UploadAnalyzer tender={tender} />
      </main>
    </div>
  );
}
