import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TenderNotice } from "@/lib/types";
import { MatchScore } from "@/lib/scoring";
import { INTL_LOCALE, type Locale } from "@/lib/locales";
import AddToWorkflowButton from "./AddToWorkflowButton";
import MatchScoreBadge from "./MatchScoreBadge";

export default async function TenderCard({
  tender,
  score,
}: {
  tender: TenderNotice;
  score?: MatchScore;
}) {
  const t = await getTranslations("TenderCard");
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

  return (
    <div className="relative border-b border-line py-5 hover:bg-paperDim transition-colors -mx-4 px-4 rounded-doc">
      {/* Stretched link: covers the whole card so it's still click-anywhere,
          while AddToWorkflowButton below sits in its own stacking context
          (relative z-10) so it stays independently clickable. */}
      <Link
        href={`/tenders/${encodeURIComponent(tender.publicationNumber)}`}
        className="absolute inset-0 rounded-doc"
        aria-label={tender.title}
      />

      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-inkDim mb-1">
            {t("refPublished", {
              ref: tender.publicationNumber,
              date: formatDate(tender.publicationDate),
            })}
          </p>
          <h3 className="font-display font-semibold text-base text-ink leading-snug">
            {tender.title}
          </h3>
          <p className="text-sm text-inkDim mt-1 flex items-center gap-2 flex-wrap">
            {tender.buyerName}
            {tender.titleLanguages.length > 0 && (
              <span
                className="text-[10px] font-medium uppercase tracking-wide border border-line rounded-full px-2 py-0.5 text-inkDim shrink-0"
                title={t("titleLanguageHint", { languages: tender.titleLanguages.join(", ").toUpperCase() })}
              >
                {tender.titleLanguages.join(" · ").toUpperCase()}
              </span>
            )}
          </p>
          {score && (
            <div className="relative z-10">
              <MatchScoreBadge score={score} />
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-inkDim uppercase tracking-wide">{t("deadline")}</p>
          <p className="text-sm text-ink font-medium">{formatDate(tender.deadline)}</p>
        </div>
      </div>
      {tender.cpvCodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {Array.from(new Set(tender.cpvCodes)).slice(0, 4).map((cpv) => (
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
        <AddToWorkflowButton publicationNumber={tender.publicationNumber} />
      </div>
    </div>
  );
}
