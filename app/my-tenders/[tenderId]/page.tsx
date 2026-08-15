import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import TenderStatusBadge from "@/components/tenders/TenderStatusBadge";
import { MatchScorePill, RecommendationPill } from "@/components/tenders/BidMatchBadge";
import StartBidButton from "@/components/tenders/StartBidButton";
import MapEvidenceButton from "@/components/tenders/MapEvidenceButton";
import { createClient } from "@/lib/supabase/server";
import {
  DisqualifierSeverity,
  DisqualifyingFactor,
  EvidenceCoverageStatus,
  REQUIREMENT_CATEGORIES,
  ScoreDimension,
} from "@/lib/ai/types";

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

const SEVERITY_DOT: Record<DisqualifierSeverity, string> = {
  CRITICAL: "bg-stamp",
  HIGH: "bg-stamp",
  MEDIUM: "bg-gold",
  LOW: "bg-inkDim",
};

const EVIDENCE_STATUS_DOT: Record<EvidenceCoverageStatus, string> = {
  VERIFIED: "bg-moss",
  PARTIAL: "bg-gold",
  MISSING: "bg-stamp",
  CONTRADICTED: "bg-stamp",
  NEEDS_REVIEW: "bg-line",
};

const COVERED_STATUSES = new Set<EvidenceCoverageStatus>(["VERIFIED", "PARTIAL"]);

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

  const requirementIds = (requirements ?? []).map((r) => r.id);
  const { data: evidenceMappings } =
    requirementIds.length > 0
      ? await supabase
          .from("tender_requirement_evidence")
          .select(
            "tender_requirement_id, status, confidence, notes, tender_requirement_evidence_items(evidence_type, evidence_id, label)"
          )
          .in("tender_requirement_id", requirementIds)
      : { data: [] as never[] };
  const evidenceByRequirement = new Map(
    (evidenceMappings ?? []).map((m) => [m.tender_requirement_id as string, m])
  );
  const coveredCount = (evidenceMappings ?? []).filter((m) =>
    COVERED_STATUSES.has(m.status as EvidenceCoverageStatus)
  ).length;
  const evidenceCoveragePct =
    requirementIds.length > 0 ? Math.round((coveredCount / requirementIds.length) * 100) : null;

  const extras: AiAnalysisExtras = tender.ai_analysis ?? {};
  const scoreDimensions: ScoreDimension[] = tender.ai_scorecard_dimensions ?? [];
  const disqualifyingFactors: DisqualifyingFactor[] = tender.ai_disqualifiers ?? [];
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
            {scoreDimensions.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-lg text-ink mb-3">TenderProc Score</h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  {scoreDimensions.map((d) => (
                    <div key={d.key} className="border border-line rounded-doc p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-inkDim">
                          {d.label}
                        </p>
                        <p className="text-sm font-semibold text-ink">
                          {d.score !== null ? `${d.score}/100` : "—"}
                        </p>
                      </div>
                      {d.score !== null ? (
                        <div className="h-1.5 bg-paperDim rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-accent rounded-full" style={{ width: `${d.score}%` }} />
                        </div>
                      ) : (
                        <p className="text-xs text-inkDim italic mb-2">
                          {d.unavailableReason ?? "Data unavailable."}
                        </p>
                      )}
                      {d.explanation && <p className="text-xs text-inkDim">{d.explanation}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {disqualifyingFactors.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-lg text-stamp mb-3">Why Not Bid?</h2>
                <div className="space-y-2">
                  {disqualifyingFactors.map((f, i) => (
                    <div key={i} className="border border-line rounded-doc p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[f.severity]}`} />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-inkDim">
                          {f.severity}
                        </span>
                        <span className="font-medium text-ink text-sm">{f.requirement}</span>
                      </div>
                      <p className="text-sm text-inkDim mt-1">
                        Company status: <span className="text-ink">{f.companyStatus}</span>
                      </p>
                      <p className="text-sm text-inkDim mt-1">{f.explanation}</p>
                      {f.possibleMitigation && (
                        <p className="text-xs text-moss mt-2">
                          Possible mitigation: {f.possibleMitigation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {requirementIds.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h2 className="font-display font-semibold text-lg text-ink">
                    Evidence coverage
                    {evidenceCoveragePct !== null && (
                      <span className="text-inkDim font-normal text-base"> · {evidenceCoveragePct}%</span>
                    )}
                  </h2>
                  <MapEvidenceButton tenderId={tender.id} hasMapping={evidenceByRequirement.size > 0} />
                </div>
                {evidenceByRequirement.size === 0 ? (
                  <p className="text-sm text-inkDim">
                    Not mapped yet — click Map Evidence to Requirements to see which of your
                    company&apos;s services, certifications, and references cover each requirement.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(requirements ?? []).map((r) => {
                      const mapping = evidenceByRequirement.get(r.id);
                      if (!mapping) return null;
                      const status = mapping.status as EvidenceCoverageStatus;
                      const items =
                        (mapping.tender_requirement_evidence_items as
                          | { evidence_type: string; evidence_id: string; label: string }[]
                          | null) ?? [];
                      return (
                        <div key={r.id} className="border border-line rounded-doc p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2">
                              <span
                                className={`inline-block w-2 h-2 rounded-full ${EVIDENCE_STATUS_DOT[status]}`}
                              />
                              <span className="font-medium text-ink text-sm">{r.title}</span>
                            </span>
                            <span className="text-xs text-inkDim">{status.replace(/_/g, " ")}</span>
                          </div>
                          {items.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {items.map((e, i) => (
                                <li key={i} className="text-xs text-ink flex gap-2">
                                  <span className="text-moss">✓</span>
                                  {e.label}
                                </li>
                              ))}
                            </ul>
                          )}
                          {mapping.notes && <p className="text-xs text-inkDim mt-1">{mapping.notes}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

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
