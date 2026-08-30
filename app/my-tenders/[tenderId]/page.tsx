import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import TenderStatusBadge from "@/components/tenders/TenderStatusBadge";
import { MatchScorePill, RecommendationPill } from "@/components/tenders/BidMatchBadge";
import StartBidButton from "@/components/tenders/StartBidButton";
import MapEvidenceButton from "@/components/tenders/MapEvidenceButton";
import TranslateTenderButton from "@/components/tenders/TranslateTenderButton";
import FailedTenderActions from "@/components/tenders/FailedTenderActions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirementCategoryLabel } from "@/lib/requirementCategory";
import { INTL_LOCALE, type Locale } from "@/lib/locales";
import { AiAnalysisExtras, trField } from "@/lib/tenders/translation";
import {
  DisqualifierSeverity,
  DisqualifyingFactor,
  EvidenceCoverageStatus,
  REQUIREMENT_CATEGORIES,
  ScoreDimension,
} from "@/lib/ai/types";

export const dynamic = "force-dynamic";

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
  const t = await getTranslations("TenderDetail");
  const tCategory = await getTranslations("Enums.requirementCategory");
  const tSeverity = await getTranslations("Enums.disqualifierSeverity");
  const tEvidenceStatus = await getTranslations("Enums.evidenceCoverageStatus");
  const tConfidence = await getTranslations("Enums.confidence");
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

  function formatValue(value: number | null, currency: string | null) {
    if (value === null) return "—";
    return `${currency ?? "EUR"} ${new Intl.NumberFormat(INTL_LOCALE[locale]).format(value)}`;
  }

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

  // No RLS policy on content_translations (service-role only, see
  // supabase-i18n-migration.sql) — read via the admin client after the
  // ownership check above already scoped this whole page to this user's tender.
  let translated: Record<string, string> | null = null;
  if (locale !== "en") {
    const { data: translationRow } = await createAdminClient()
      .from("content_translations")
      .select("fields")
      .eq("source_table", "tenders")
      .eq("source_id", tenderId)
      .eq("locale", locale)
      .maybeSingle();
    translated = (translationRow?.fields as Record<string, string> | undefined) ?? null;
  }
  const tr = (key: string, fallback: string) => trField(translated, key, fallback);

  return (
    <div>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/my-tenders" className="text-sm text-inkDim hover:text-ink">
          ← {t("backToTenders")}
        </Link>

        <div className="mt-6 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <TenderStatusBadge status={tender.status} />
          </div>
          <h1 className="font-display font-bold text-3xl text-ink leading-tight tracking-tight">
            {tender.title || (tender.status === "FAILED" ? t("analysisFailed") : t("analyzingTender"))}
          </h1>

          {tender.status === "FAILED" && (
            <div className="mt-4 border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp">
              {t("failedMessage")}
              <FailedTenderActions tenderId={tender.id} />
            </div>
          )}

          {(tender.status === "PROCESSING" || tender.status === "ANALYZING") && (
            <div className="mt-4 border border-line bg-paperDim rounded-doc p-4 text-sm text-inkDim">
              {t("stillProcessing")}
            </div>
          )}

          {tender.status === "READY" && (
            <>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 border-y border-line py-4">
                <div>
                  <dt className="text-[10px] font-medium uppercase text-inkDim">{t("authority")}</dt>
                  <dd className="text-sm text-ink mt-0.5">{tender.contracting_authority ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium uppercase text-inkDim">{t("deadline")}</dt>
                  <dd className="text-sm text-ink mt-0.5">{formatDate(tender.submission_deadline)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium uppercase text-inkDim">{t("estValue")}</dt>
                  <dd className="text-sm text-ink mt-0.5">
                    {formatValue(tender.estimated_value, tender.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium uppercase text-inkDim">{t("duration")}</dt>
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
                  {t("viewOriginalPdf")} →
                </a>
              )}

              {tender.ai_summary && (
                <p className="text-ink leading-relaxed mt-4">{tr("summary", tender.ai_summary)}</p>
              )}

              {locale !== "en" && !translated && (
                <div className="mt-4">
                  <TranslateTenderButton tenderId={tender.id} />
                </div>
              )}

              <div className="mt-6">
                {tender.ai_match_score !== null ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <MatchScorePill score={tender.ai_match_score} />
                    {tender.ai_recommendation && (
                      <RecommendationPill recommendation={tender.ai_recommendation} />
                    )}
                    {tender.ai_recommendation_confidence && (
                      <span className="text-xs text-inkDim">
                        {t("confidence", { level: tConfidence(tender.ai_recommendation_confidence) })}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="border border-line rounded-doc p-4 text-sm text-inkDim">
                    {t("addCompanyProfileBefore")}{" "}
                    <Link href="/company" className="text-accent underline">
                      {t("companyProfile")}
                    </Link>{" "}
                    {t("addCompanyProfileAfter")}
                  </div>
                )}
              </div>

              <div className="mt-6">
                {existingBid ? (
                  <Link
                    href={`/bids/${existingBid.id}`}
                    className="inline-block bg-accent text-white px-5 py-2.5 rounded-doc font-medium shadow-xs hover:bg-accentDim transition-colors"
                  >
                    {t("goToBidWorkspace")} →
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
                <h2 className="font-display font-semibold text-lg text-ink mb-3">
                  {t("tenderProcScore")}
                </h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  {scoreDimensions.map((d, i) => (
                    <div key={d.key} className="border border-line rounded-doc p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-inkDim">
                          {tr(`dimensions.${i}.label`, d.label)}
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
                          {d.unavailableReason
                            ? tr(`dimensions.${i}.unavailableReason`, d.unavailableReason)
                            : t("dataUnavailable")}
                        </p>
                      )}
                      {d.explanation && (
                        <p className="text-xs text-inkDim">{tr(`dimensions.${i}.explanation`, d.explanation)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {disqualifyingFactors.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-lg text-stamp mb-3">
                  {t("whyNotBid")}
                </h2>
                <div className="space-y-2">
                  {disqualifyingFactors.map((f, i) => (
                    <div key={i} className="border border-line rounded-doc p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[f.severity]}`} />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-inkDim">
                          {tSeverity(f.severity)}
                        </span>
                        <span className="font-medium text-ink text-sm">
                          {tr(`disqualifiers.${i}.requirement`, f.requirement)}
                        </span>
                      </div>
                      <p className="text-sm text-inkDim mt-1">
                        {t("companyStatus")}{" "}
                        <span className="text-ink">{tr(`disqualifiers.${i}.companyStatus`, f.companyStatus)}</span>
                      </p>
                      <p className="text-sm text-inkDim mt-1">{tr(`disqualifiers.${i}.explanation`, f.explanation)}</p>
                      {f.possibleMitigation && (
                        <p className="text-xs text-moss mt-2">
                          {t("possibleMitigation")}{" "}
                          {tr(`disqualifiers.${i}.possibleMitigation`, f.possibleMitigation)}
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
                    {t("evidenceCoverage")}
                    {evidenceCoveragePct !== null && (
                      <span className="text-inkDim font-normal text-base"> · {evidenceCoveragePct}%</span>
                    )}
                  </h2>
                  <MapEvidenceButton tenderId={tender.id} hasMapping={evidenceByRequirement.size > 0} />
                </div>
                {evidenceByRequirement.size === 0 ? (
                  <p className="text-sm text-inkDim">{t("notMappedYet")}</p>
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
                              <span className="font-medium text-ink text-sm">
                                {tr(`requirements.${r.id}.title`, r.title)}
                              </span>
                            </span>
                            <span className="text-xs text-inkDim">{tEvidenceStatus(status)}</span>
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
                          {mapping.notes && (
                            <p className="text-xs text-inkDim mt-1">
                              {tr(`evidenceNotes.${r.id}`, mapping.notes)}
                            </p>
                          )}
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
                <h2 className="font-display font-semibold text-lg text-ink mb-3">
                  {t("whyThisMatches")}
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {extras.positiveFactors && extras.positiveFactors.length > 0 && (
                    <div className="border border-line rounded-2xl p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                        {t("positiveFactors")}
                      </p>
                      <ul className="space-y-1.5 text-sm text-ink">
                        {extras.positiveFactors.map((f, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-moss">✓</span>
                            {tr(`positiveFactors.${i}`, f)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(extras.recommendationRisks?.length || extras.missingRequirements?.length) && (
                    <div className="border border-line rounded-2xl p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                        {t("risks")}
                      </p>
                      <ul className="space-y-1.5 text-sm text-ink">
                        {extras.recommendationRisks?.map((rr, i) => (
                          <li key={`r${i}`} className="flex gap-2">
                            <span className="text-gold">⚠</span>
                            {tr(`recommendationRisks.${i}`, rr)}
                          </li>
                        ))}
                        {extras.missingRequirements?.map((mr, i) => (
                          <li key={`m${i}`} className="flex gap-2">
                            <span className="text-gold">⚠</span>
                            {t("missing", { requirement: tr(`missingRequirements.${i}`, mr) })}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {extras.estimatedEffortHours && (
                  <p className="text-xs text-inkDim mt-3">
                    {t("effortEstimate", {
                      min: extras.estimatedEffortHours.min,
                      max: extras.estimatedEffortHours.max,
                    })}
                  </p>
                )}
              </section>
            )}

            {awardCriteria && awardCriteria.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-lg text-ink mb-3">
                  {t("awardCriteria")}
                </h2>
                <ul className="space-y-2">
                  {awardCriteria.map((c) => (
                    <li key={c.id} className="border border-line rounded-doc p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink">
                          {tr(`awardCriteria.${c.id}.criterion`, c.criterion)}
                        </span>
                        {c.weight && <span className="text-inkDim">{c.weight}</span>}
                      </div>
                      {c.description && (
                        <p className="text-inkDim mt-1">{tr(`awardCriteria.${c.id}.description`, c.description)}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {requirementsByCategory.length > 0 && (
              <section>
                <h2 className="font-display font-semibold text-lg text-ink mb-3">
                  {t("requirements")}
                </h2>
                <div className="space-y-5">
                  {requirementsByCategory.map((group) => (
                    <div key={group.category}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                        {requirementCategoryLabel(group.category, tCategory)} · {group.items.length}
                      </p>
                      <ul className="space-y-2">
                        {group.items.map((r) => (
                          <li key={r.id} className="border border-line rounded-doc p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-ink">
                                {tr(`requirements.${r.id}.title`, r.title)}
                              </span>
                              {r.mandatory && (
                                <span className="text-[10px] font-semibold uppercase text-stamp">
                                  {t("mandatory")}
                                </span>
                              )}
                            </div>
                            {r.description && (
                              <p className="text-inkDim mt-1">{tr(`requirements.${r.id}.description`, r.description)}</p>
                            )}
                            {(r.source_page || r.source_section) && (
                              <p className="text-xs text-inkDim mt-1">
                                {t("source", {
                                  parts: [r.source_section, r.source_page && `p. ${r.source_page}`]
                                    .filter(Boolean)
                                    .join(", "),
                                })}
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
                      {t("requiredDocuments")}
                    </p>
                    <ul className="space-y-1 text-sm text-ink">
                      {extras.requiredDocuments.map((d, i) => (
                        <li key={i}>{tr(`requiredDocuments.${i}`, d)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {extras.risks && extras.risks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                      {t("risks")}
                    </p>
                    <ul className="space-y-1 text-sm text-ink">
                      {extras.risks.map((r, i) => (
                        <li key={i}>{tr(`risks.${i}`, r)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {extras.ambiguities && extras.ambiguities.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                      {t("ambiguities")}
                    </p>
                    <ul className="space-y-1 text-sm text-ink">
                      {extras.ambiguities.map((a, i) => (
                        <li key={i}>{tr(`ambiguities.${i}`, a)}</li>
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
