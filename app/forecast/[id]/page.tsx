import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import AddToWorkflowButton from "@/components/AddToWorkflowButton";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import ForecastDisclaimer from "@/components/ForecastDisclaimer";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRowToForecastAward } from "@/lib/forecast/types";
import { sectorLabelForCpv } from "@/lib/sectors";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

export const dynamic = "force-dynamic";

export default async function ForecastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("ForecastDetail");
  const tSector = await getTranslations("Enums.sector");
  const locale = (await getLocale()) as Locale;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("contract_awards")
    .select(
      "id, source_reference, contracting_authority, cpv_codes, award_date, winner_name, award_value, award_value_currency, source_url, raw_title, contract_duration_months, duration_confidence, estimated_expiry_date"
    )
    .eq("id", id)
    .maybeSingle();

  const award = row ? mapRowToForecastAward(row) : null;
  if (!award) notFound();

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

  function formatValue(n: number | null, currency: string | null) {
    if (n == null) return "—";
    return `${currency ?? "EUR"} ${new Intl.NumberFormat(INTL_LOCALE[locale]).format(n)}`;
  }

  const sector = sectorLabelForCpv(award.cpvCodes, tSector);
  const reasoning =
    award.contractDurationMonths != null && award.awardDate
      ? t("reasoningFromDuration", {
          awardDate: formatDate(award.awardDate),
          months: award.contractDurationMonths,
          expiryDate: formatDate(award.estimatedExpiryDate),
        })
      : t("reasoningFromEndDate", { expiryDate: formatDate(award.estimatedExpiryDate) });

  return (
    <div>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/forecast" className="text-sm text-inkDim hover:text-ink">
          ← {t("backToForecast")}
        </Link>

        <div className="mt-6 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <ConfidenceBadge confidence={award.durationConfidence} months={award.contractDurationMonths} />
            {sector && (
              <span className="text-[10px] font-medium uppercase tracking-wide border border-line rounded-full px-2 py-0.5 text-inkDim">
                {sector}
              </span>
            )}
          </div>
          <h1 className="font-display font-bold text-2xl text-ink tracking-tight">
            {award.contractingAuthority}
          </h1>
          <p className="text-sm text-inkDim mt-1">{award.rawTitle}</p>

          <dl className="grid sm:grid-cols-2 gap-4 mt-6 border border-line rounded-2xl p-5 bg-white">
            <div>
              <dt className="text-xs text-inkDim uppercase tracking-wide">{t("buyer")}</dt>
              <dd className="text-sm text-ink font-medium mt-0.5">{award.contractingAuthority}</dd>
            </div>
            <div>
              <dt className="text-xs text-inkDim uppercase tracking-wide">{t("incumbentWinner")}</dt>
              <dd className="text-sm text-ink font-medium mt-0.5">
                {award.winnerName ?? t("unknownWinner")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-inkDim uppercase tracking-wide">{t("awardDate")}</dt>
              <dd className="text-sm text-ink font-medium mt-0.5">{formatDate(award.awardDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-inkDim uppercase tracking-wide">{t("awardValue")}</dt>
              <dd className="text-sm text-ink font-medium mt-0.5">
                {formatValue(award.awardValue, award.awardValueCurrency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-inkDim uppercase tracking-wide">{t("cpvCodes")}</dt>
              <dd className="text-sm text-ink font-medium mt-0.5">
                {award.cpvCodes.join(", ") || "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-6 border border-line rounded-2xl p-5 bg-paperDim">
            <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
              {t("forecastReasoning")}
            </p>
            <p className="text-sm text-ink leading-relaxed">{reasoning}</p>
          </div>

          <div className="mt-4">
            <ForecastDisclaimer />
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap mt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <a
                href={award.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent underline"
              >
                {t("viewOriginalNotice")} →
              </a>
              <Link
                href={`/tenders/${encodeURIComponent(award.sourceReference)}`}
                className="text-sm text-accent underline"
              >
                {t("viewInApp")} →
              </Link>
            </div>
            <AddToWorkflowButton publicationNumber={award.sourceReference} />
          </div>
        </div>
      </main>
    </div>
  );
}
