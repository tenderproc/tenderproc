import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { RunReviewButton, MarkSubmittedButton, DownloadDocumentLink } from "@/components/bids/ReviewActions";

export const dynamic = "force-dynamic";

export default async function BidReviewPage({ params }: { params: Promise<{ bidId: string }> }) {
  const { bidId } = await params;
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
          ← Back to bid
        </Link>

        <h1 className="font-display font-bold text-3xl text-ink mt-3 mb-1 leading-tight tracking-tight">
          Pre-submission review
        </h1>
        <p className="text-sm text-inkDim mb-8">{tender?.title || "Untitled tender"}</p>

        {!review && (
          <div className="border border-line bg-white rounded-2xl p-6 mb-8">
            <p className="text-sm text-inkDim mb-4">
              No review has been run yet. Running it checks your requirement checklist,
              document checklist, and drafted responses for anything that would block
              submission.
            </p>
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
                    {review.ready_to_submit ? "Ready to submit" : "Not ready to submit"}
                  </p>
                  <p className="font-display font-bold text-4xl text-ink mt-1">
                    {review.compliance_score}% compliant
                  </p>
                </div>
                <RunReviewButton bidId={bidId} hasReview={true} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-inkDim text-xs uppercase tracking-wide">Critical issues</p>
                  <p className="text-ink font-semibold text-lg">{review.critical_issues.length}</p>
                </div>
                <div>
                  <p className="text-inkDim text-xs uppercase tracking-wide">Warnings</p>
                  <p className="text-ink font-semibold text-lg">{review.warnings.length}</p>
                </div>
                <div>
                  <p className="text-inkDim text-xs uppercase tracking-wide">Requirements</p>
                  <p className="text-ink font-semibold text-lg">
                    {review.requirements_complete}/{review.requirements_total}
                  </p>
                </div>
                <div>
                  <p className="text-inkDim text-xs uppercase tracking-wide">Documents</p>
                  <p className="text-ink font-semibold text-lg">
                    {review.documents_ready}/{review.documents_total}
                  </p>
                </div>
              </div>
              <p className="text-xs text-inkDim mt-4">
                Last run {new Date(review.created_at).toLocaleString("en-GB")} ·{" "}
                {review.unsupported_claims_open} unresolved unsupported claim
                {review.unsupported_claims_open === 1 ? "" : "s"}
              </p>
            </div>

            {review.critical_issues.length > 0 && (
              <div className="border border-stamp/30 bg-white rounded-2xl p-6 mb-6">
                <h2 className="font-display font-semibold text-base text-stamp mb-3">
                  Critical issues
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
                <h2 className="font-display font-semibold text-base text-gold mb-3">Warnings</h2>
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
              <h2 className="font-display font-semibold text-lg text-ink mb-4">Submission</h2>

              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                  Download Bid Package
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
                  <p className="text-sm text-inkDim">
                    No documents uploaded yet — attach them from the Documents checklist on the bid
                    workspace page.
                  </p>
                )}
              </div>

              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                  Official submission
                </p>
                {tender?.source_url ? (
                  <a
                    href={tender.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:underline"
                  >
                    Open Official Submission Platform →
                  </a>
                ) : (
                  <p className="text-sm text-inkDim">
                    No submission platform link is on file for this tender — submit directly through
                    the contracting authority&apos;s official channel.
                  </p>
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
