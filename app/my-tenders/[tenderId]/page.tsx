import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import TenderStatusBadge from "@/components/tenders/TenderStatusBadge";
import { MatchScorePill, RecommendationPill } from "@/components/tenders/BidMatchBadge";
import StartBidButton from "@/components/tenders/StartBidButton";
import { createClient } from "@/lib/supabase/server";
import { REQUIREMENT_CATEGORIES } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

function formatDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatValue(value: number | null, currency: string | null) {
  if (value === null) return "—";
  return `${currency ?? "EUR"} ${new Intl.NumberFormat("en-BE").format(value)}`;
}

function categoryLabel(category: string) {
  return category.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

interface AiAnalysisExtras {
  requiredDocuments?: string[];
  risks?: string[];
  ambiguities?: string[];
  positiveFactors?: string[];
  recommendationRisks?: string[];
  missingRequirements?: string[];
  estimatedEffortHours?: { min: number; max: number } | null;
}

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ tenderId: string }>;
}) {
  const { tenderId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/my-tenders/${tenderId}`);

  const { data: tender } = await supabase
    .from("tenders")
    .select("*")
    .eq("id", tenderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tender) notFound();

  const [{ data: requirements }, { data: awardCriteria }, { data: documents }] = await Promise.all([
    supabase
      .from("tender_requirements")
      .select("id, title, description, category, mandatory, source_page, source_section, status")
      .eq("tender_id", tenderId),
    supabase
      .from("tender_award_criteria")
      .select("id, criterion, weight, description")
      .eq("tender_id", tenderId),
    supabase
      .from("tender_documents")
      .select("id, file_name, storage_path, processing_status")
      .eq("tender_id", tenderId),
  ]);

  let documentUrl: string | null = null;
  if (documents && documents[0]) {
    const { data: signed } = await supabase.storage
      .from("tender-documents")
      .createSignedUrl(documents[0].storage_path, 60 * 10);
    documentUrl = signed?.signedUrl ?? null;
  }

  const { data: existingBid } = await supabase
    .from("bids")
    .select("id")
    .eq("tender_id", tenderId)
    .maybeSingle();

  const extras: AiAnalysisExtras = tender.ai_analysis ?? {};
  const requirementsByCategory = REQUIREMENT_CATEGORIES.map((cat) => ({
    category: cat,
    items: (requirements ?? []).filter((r) => r.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/my-tenders" className="text-sm text-inkDim hover:text-ink">
          ← Back to tenders
        </Link>

        <div className="mt-6 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <TenderStatusBadge status={tender.status} />
          </div>
          <h1 className="font-display font-bold text-3xl text-ink leading-tight tracking-tight">
            {tender.title || "Analyzing tender…"}
          </h1>

          {tender.status === "FAILED" && (
            <div className="mt-4 border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp">
              This tender couldn&apos;t be processed. Common causes: the PDF
              has no extractable text (a scanned document without OCR) or
              the AI analysis failed. Try re-uploading, or a different file.
            </div>
          )}

          {(tender.status === "PROCESSING" || tender.status === "ANALYZING") && (
            <div className="mt-4 border border-line bg-paperDim rounded-doc p-4 text-sm text-inkDim">
              Still processing — refresh in a moment.
            </div>
          )}

          {tender.status === "READY" && (
            <>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 border-y border-line py-4">
                <div>
                  <dt className="text-[10px] font-medium uppercase text-inkDim">Authority</dt>
                  <dd className="text-sm text-ink mt-0.5">{tender.contracting_authority ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium uppercase text-inkDim">Deadline</dt>
                  <dd className="text-sm text-ink mt-0.5">{formatDate(tender.submission_deadline)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium uppercase text-inkDim">Est. value</dt>
                  <dd className="text-sm text-ink mt-0.5">
                    {formatValue(tender.estimated_value, tender.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium uppercase text-inkDim">Duration</dt>
                  <dd className="text-sm text-ink mt-0.5">{tender.contract_duration ?? "—"}</dd>
                </div>
              </dl>

              {documentUrl && (
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 text-sm text-accent underline"
                >
                  View original PDF →
                </a>
              )}

              {tender.ai_summary && (
                <p className="text-ink leading-relaxed mt-4">{tender.ai_summary}</p>
              )}

              <div className="mt-6">
                {tender.ai_match_score !== null ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <MatchScorePill score={tender.ai_match_score} matchLabel={tender.ai_match_label} />
                    {tender.ai_recommendation && (
                      <RecommendationPill recommendation={tender.ai_recommendation} />
                    )}
                    {tender.ai_recommendation_confidence && (
                      <span className="text-xs text-inkDim">
                        Confidence: {tender.ai_recommendation_confidence}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="border border-line rounded-doc p-4 text-sm text-inkDim">
                    Add your{" "}
                    <Link href="/company" className="text-accent underline">
                      company profile
                    </Link>{" "}
                    to get a match score and Bid/No-Bid recommendation for this tender.
                  </div>
                )}
              </div>

              <div className="mt-6">
                {existingBid ? (
                  <Link
                    href={`/bids/${existingBid.id}`}
                    className="inline-block bg-accent text-white px-5 py-2.5 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors"
                  >
                    Go to Bid Workspace →
                  </Link>
                ) : (
                  <StartBidButton tenderId={tender.id} />
                )}
              </div>
            </>
          )}
        </div>

        {tender.status === "READY" && (
          <div className="space-y-8">
            {(extras.positiveFactors?.length ||
              extras.recommendationRisks?.length ||
              extras.missingRequirements?.length ||
              extras.estimatedEffortHours) && (
              <section>
                <h2 className="font-display font-semibold text-lg text-ink mb-3">Why this matches</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {extras.positiveFactors && extras.positiveFactors.length > 0 && (
                    <div className="border border-line rounded-2xl p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                        Positive factors
                      </p>
                      <ul className="space-y-1.5 text-sm text-ink">
                        {extras.positiveFactors.map((f, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-moss">✓</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(extras.recommendationRisks?.length || extras.missingRequirements?.length) && (
                    <div className="border border-line rounded-2xl p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                        Risks
                      </p>
                      <ul className="space-y-1.5 text-sm text-ink">
                        {extras.recommendationRisks?.map((r, i) => (
                          <li key={`r${i}`} className="flex gap-2">
                            <span className="text-gold">⚠</span>
                            {r}
                          </li>
                        ))}
                        {extras.missingRequirements?.map((r, i) => (
                          <li key={`m${i}`} className="flex gap-2">
                            <span className="text-gold">⚠</span>
                            Missing: {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {extras.estimatedEffortHours && (
                  <p className="text-xs text-inkDim mt-3">
                    ESTIMATE — HUMAN VERIFICATION REQUIRED: {extras.estimatedEffortHours.min}–
                    {extras.estimatedEffortHours.max} hours of bid preparation effort.
                  </p>
                )}
              </section>
            )}

            {awardCriteria && awardCriteria.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-lg text-ink mb-3">Award criteria</h2>
                <ul className="space-y-2">
                  {awardCriteria.map((c) => (
                    <li key={c.id} className="border border-line rounded-doc p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink">{c.criterion}</span>
                        {c.weight && <span className="text-inkDim">{c.weight}</span>}
                      </div>
                      {c.description && <p className="text-inkDim mt-1">{c.description}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {requirementsByCategory.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-lg text-ink mb-3">Requirements</h2>
                <div className="space-y-5">
                  {requirementsByCategory.map((group) => (
                    <div key={group.category}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                        {categoryLabel(group.category)} · {group.items.length}
                      </p>
                      <ul className="space-y-2">
                        {group.items.map((r) => (
                          <li key={r.id} className="border border-line rounded-doc p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-ink">{r.title}</span>
                              {r.mandatory && (
                                <span className="text-[10px] font-semibold uppercase text-stamp">
                                  Mandatory
                                </span>
                              )}
                            </div>
                            {r.description && <p className="text-inkDim mt-1">{r.description}</p>}
                            {(r.source_page || r.source_section) && (
                              <p className="text-xs text-inkDim mt-1">
                                Source: {[r.source_section, r.source_page && `p. ${r.source_page}`]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(extras.requiredDocuments?.length || extras.risks?.length || extras.ambiguities?.length) && (
              <section className="grid sm:grid-cols-3 gap-4">
                {extras.requiredDocuments && extras.requiredDocuments.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                      Required documents
                    </p>
                    <ul className="space-y-1 text-sm text-ink">
                      {extras.requiredDocuments.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {extras.risks && extras.risks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                      Risks
                    </p>
                    <ul className="space-y-1 text-sm text-ink">
                      {extras.risks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {extras.ambiguities && extras.ambiguities.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                      Ambiguities
                    </p>
                    <ul className="space-y-1 text-sm text-ink">
                      {extras.ambiguities.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
