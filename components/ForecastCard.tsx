import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ForecastAward } from "@/lib/forecast/types";
import { quarterLabel } from "@/lib/forecast/format";
import { sectorLabelForCpv } from "@/lib/sectors";
import { INTL_LOCALE, type Locale } from "@/lib/locales";
import AddToWorkflowButton from "./AddToWorkflowButton";
import ConfidenceBadge from "./ConfidenceBadge";

export default async function ForecastCard({ award }: { award: ForecastAward }) {
  const t = await getTranslations("ForecastCard");
  const tSector = await getTranslations("Enums.sector");
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

  const sector = sectorLabelForCpv(award.cpvCodes, tSector);

  return (
    <div className="relative border-b border-line py-5 hover:bg-paperDim transition-colors -mx-4 px-4 rounded-doc">
      {/* Stretched link, same pattern as TenderCard: covers the whole card
          while AddToWorkflowButton keeps its own stacking context (relative
          z-10) so it stays independently clickable. */}
      <Link
        href={`/forecast/${award.id}`}
        className="absolute inset-0 rounded-doc"
        aria-label={award.rawTitle ?? award.contractingAuthority}
      />

      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-inkDim mb-1">
            {t("awardedOn", { date: formatDate(award.awardDate) })}
          </p>
          <h3 className="font-display font-semibold text-base text-ink leading-snug">
            {award.contractingAuthority}
          </h3>
          <p className="text-sm text-inkDim mt-1 flex items-center gap-2 flex-wrap">
            {t("incumbent", { winner: award.winnerName ?? t("unknownWinner") })}
            {sector && (
              <span className="text-[10px] font-medium uppercase tracking-wide border border-line rounded-full px-2 py-0.5 text-inkDim shrink-0">
                {sector}
              </span>
            )}
          </p>
          <div className="relative z-10 mt-2">
            <ConfidenceBadge confidence={award.durationConfidence} months={award.contractDurationMonths} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-inkDim uppercase tracking-wide">{t("estimatedRetender")}</p>
          <p className="text-sm text-ink font-medium">{quarterLabel(award.estimatedExpiryDate)}</p>
        </div>
      </div>

      {award.cpvCodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {Array.from(new Set(award.cpvCodes)).slice(0, 4).map((cpv) => (
            <span
              key={cpv}
              className="text-[10px] font-medium border border-line rounded-full px-2 py-0.5 text-inkDim"
            >
              {cpv}
            </span>
          ))}
        </div>
      )}

      <div className="relative z-10 mt-3 inline-block">
        <AddToWorkflowButton publicationNumber={award.sourceReference} />
      </div>
    </div>
  );
}
