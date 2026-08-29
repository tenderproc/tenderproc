import { getTranslations } from "next-intl/server";
import { DurationConfidence } from "@/lib/forecast/expiry";

// "unknown" awards never reach the forecast list (see /forecast's query —
// duration_confidence unknown means estimated_expiry_date is null, so
// there's nothing to forecast), but the type is kept broad here so this
// badge stays correct if it's ever reused somewhere unfiltered.
const STYLE: Record<DurationConfidence, string> = {
  confirmed: "bg-moss/10 border-moss/25 text-moss",
  estimated: "bg-gold/10 border-gold/25 text-gold",
  unknown: "bg-inkDim/10 border-inkDim/25 text-inkDim",
};

export default async function ConfidenceBadge({
  confidence,
  months,
}: {
  confidence: DurationConfidence;
  /** contract_awards.contract_duration_months — null when the expiry came from an explicit end date rather than a duration figure. */
  months?: number | null;
}) {
  const t = await getTranslations("ConfidenceBadge");
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide border rounded-full px-2 py-0.5 ${STYLE[confidence]}`}
    >
      {t(confidence)}
      {months != null && <> · {t("months", { months })}</>}
    </span>
  );
}
