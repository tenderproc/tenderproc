import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import UploadAnalyzer from "@/components/UploadAnalyzer";
import AddToWorkflowButton from "@/components/AddToWorkflowButton";
import MatchScoreBadge from "@/components/MatchScoreBadge";
import { getTenderById } from "@/lib/ted";
import { createClient } from "@/lib/supabase/server";
import { getMatchScores } from "@/lib/matchScoreCache";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

export const dynamic = "force-dynamic";

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("PublicTenderDetail");
  const locale = (await getLocale()) as Locale;

  function formatDate(d: string | null) {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString(INTL_LOCALE[locale], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let languageKeys: string[] | undefined;
  let sectors: string[] = [];
  let companyDescription = "";
  let address = "";
  let companySize = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("sectors, languages, company_description, address, company_size")
      .eq("id", user.id)
      .maybeSingle();
    languageKeys = profile?.languages?.length ? profile.languages : undefined;
    sectors = profile?.sectors ?? [];
    companyDescription = profile?.company_description ?? "";
    address = profile?.address ?? "";
    companySize = profile?.company_size ?? "";
  }

  const tender = await getTenderById(decodeURIComponent(id), languageKeys);
  if (!tender) notFound();

  let score = undefined;
  if (user) {
    const scores = await getMatchScores(supabase, user.id, [tender], {
      sectors,
      languages: languageKeys ?? [],
      description: companyDescription,
      address,
      companySize,
    });
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
          <p className="text-xs font-medium uppercase tracking-wide text-inkDim">
            {t("ref", { ref: tender.publicationNumber })}
          </p>
          <h1 className="font-display font-bold text-3xl text-ink mt-1 leading-tight tracking-tight">
            {tender.title}
          </h1>

          {score && <MatchScoreBadge score={score} />}

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 border-y border-line py-4">
            <div>
              <dt className="text-[10px] font-medium uppercase text-inkDim">{t("buyer")}</dt>
              <dd className="text-sm text-ink mt-0.5">{tender.buyerName}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase text-inkDim">{t("deadline")}</dt>
              <dd className="text-sm text-ink mt-0.5">{formatDate(tender.deadline)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase text-inkDim">{t("estValue")}</dt>
              <dd className="text-sm text-ink mt-0.5">{tender.totalValue ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase text-inkDim">{t("published")}</dt>
              <dd className="text-sm text-ink mt-0.5">{formatDate(tender.publicationDate)}</dd>
            </div>
          </dl>

          <div className="flex items-center gap-4 mt-4">
            <a
              href={tender.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent underline"
            >
              {t("viewOnTed")} →
            </a>
            <AddToWorkflowButton publicationNumber={tender.publicationNumber} />
          </div>
        </div>

        <UploadAnalyzer tender={tender} />
      </main>
    </div>
  );
}
