import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { RunReviewButton, MarkSubmittedButton, DownloadDocumentLink } from "@/components/bids/ReviewActions";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

export const dynamic = "force-dynamic";

export default async function BidReviewPage({ params }: { params: Promise<{ bidId: string }> }) {
  const { bidId } = await params;
  const t = await getTranslations("BidReview");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bids/${bidId}/review`);

  const { data: bid } = await supabase
    .from("bids")
    .select("id, status, tender_id")
    .eq("id", bidId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!bid) notFound();

  const [{ data: tender }, { data: reviews }, { data: documents }] = await Promise.all([
    supabase.from("tenders").select("title, source_url").eq("id", bid.tender_id).maybeSingle(),
    supabase
      .from("bid_reviews")
      .select(
        "id, compliance_score, ready_to_submit, critical_issues, warnings, requirements_total, requirements_complete, documents_total, documents_ready, unsupported_claims_open, created_at"
      )
      .eq("bid_id", bidId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("bid_documents")
      .select("id, name, storage_path, file_name")
      .eq("bid_id", bidId)
      .not("storage_path", "is", null),
  ]);

  const review = reviews?.[0] ?? null;

  return (
    <div>
      <Header />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link href={`/bids/${bidId}`} className="text-sm text-inkDim hover:text-ink">
          ← {t("backToBid")}
        </Link>

        <h1 className="font-display font-bold text-3xl text-ink mt-3 mb-1 leading-tight tracking-tight">
          {t("heading")}
        </h1>
        <p className="text-sm text-inkDim mb-8">{tender?.title || t("untitledTender")}</p>

        {!review && (
          <div className="border border-line bg-white rounded-2xl p-6 mb-8">
            <p className="text-sm text-inkDim mb-4">{t("noReviewYet")}</p>
            <RunReviewButton bidId={bidId} hasReview={false} />
          </div>
        )}

        {review && (
          <>
            <div
              className={`border rounded-2xl p-6 mb-8 ${
                review.ready_to_submit
                  ? "border-moss/30 bg-moss/5"
                  : "border-stamp/30 bg-stamp/5"
              }`}
            >
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <div>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      review.ready_to_submit ? "text-moss" : "text-stamp"
                    }`}
                  >
                    {review.ready_to_submit ? t("readyToSubmit") : t("notReadyToSubmit")}
                  </p>
                  <p className="font-display font-bold text-4xl text-ink mt-1">
                    {t("compliantPercent", { score: review.compliance_score })}
                  </p>
                </div>
                <RunReviewButton bidId={bidId} hasReview={true} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-inkDim text-xs uppercase tracking-wide">{t("criticalIssues")}</p>
                  <p className="text-ink font-semibold text-lg">{review.critical_issues.length}</p>
                </div>
                <div>
                  <p className="text-inkDim text-xs uppercase tracking-wide">{t("warnings")}</p>
                  <p className="text-ink font-semibold text-lg">{review.warnings.length}</p>
                </div>
                <div>
                  <p className="text-inkDim text-xs uppercase tracking-wide">{t("requirements")}</p>
                  <p className="text-ink font-semibold text-lg">
                    {review.requirements_complete}/{review.requirements_total}
                  </p>
                </div>
                <div>
                  <p className="text-inkDim text-xs uppercase tracking-wide">{t("documents")}</p>
                  <p className="text-ink font-semibold text-lg">
                    {review.documents_ready}/{review.documents_total}
                  </p>
                </div>
              </div>
              <p className="text-xs text-inkDim mt-4">
                {t("lastRun", {
                  when: new Date(review.created_at).toLocaleString(INTL_LOCALE[locale]),
                  claims: t("unresolvedClaims", { count: review.unsupported_claims_open }),
                })}
              </p>
            </div>

            {review.critical_issues.length > 0 && (
              <div className="border border-stamp/30 bg-white rounded-2xl p-6 mb-6">
                <h2 className="font-display font-semibold text-base text-stamp mb-3">
                  {t("criticalIssues")}
                </h2>
                <ul className="space-y-2">
                  {review.critical_issues.map((issue: string, i: number) => (
                    <li key={i} className="text-sm text-ink flex gap-2">
                      <span className="text-stamp">✕</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review.warnings.length > 0 && (
              <div className="border border-gold/30 bg-white rounded-2xl p-6 mb-6">
                <h2 className="font-display font-semibold text-base text-gold mb-3">
                  {t("warnings")}
                </h2>
                <ul className="space-y-2">
                  {review.warnings.map((warning: string, i: number) => (
                    <li key={i} className="text-sm text-ink flex gap-2">
                      <span className="text-gold">⚠</span>
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border border-line bg-white rounded-2xl p-6">
              <h2 className="font-display font-semibold text-lg text-ink mb-4">{t("submission")}</h2>

              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                  {t("downloadBidPackage")}
                </p>
                {documents && documents.length > 0 ? (
                  <ul className="space-y-1">
                    {documents.map((d) => (
                      <li key={d.id}>
                        <DownloadDocumentLink storagePath={d.storage_path!} label={d.file_name || d.name} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-inkDim">{t("noDocumentsUploaded")}</p>
                )}
              </div>

              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                  {t("officialSubmission")}
                </p>
                {tender?.source_url ? (
                  <a
                    href={tender.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:underline"
                  >
                    {t("openOfficialPlatform")} →
                  </a>
                ) : (
                  <p className="text-sm text-inkDim">{t("noSubmissionPlatform")}</p>
                )}
              </div>

              <div className="pt-4 border-t border-line">
                <MarkSubmittedButton bidId={bidId} status={bid.status} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
