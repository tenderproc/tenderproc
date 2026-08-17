import { getLocale, getTranslations } from "next-intl/server";
import { TenderDetail } from "@/lib/types";
import { MatchScore } from "@/lib/scoring";
import { mapProcedureType } from "@/lib/ted";
import { sectorLabelForCpv } from "@/lib/sectors";
import { tenderStatus } from "@/lib/tenderStatus";
import { INTL_LOCALE, type Locale } from "@/lib/locales";
import MatchScoreBadge from "@/components/MatchScoreBadge";
import ExpandableText from "./ExpandableText";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-moss/10 border-moss/25 text-moss",
  deadlinePassed: "bg-line/40 border-line text-inkDim",
  unknown: "bg-line/40 border-line text-inkDim",
};

export default async function TenderOverview({
  tender,
  score,
}: {
  tender: TenderDetail;
  score?: MatchScore;
}) {
  const t = await getTranslations("TenderOverview");
  const tStatus = await getTranslations("Enums.tenderOpenStatus");
  const tSector = await getTranslations("Enums.sector");
  const locale = (await getLocale()) as Locale;

  function formatDate(d: string | null) {
    if (!d) return null;
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString(INTL_LOCALE[locale], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const status = tenderStatus(tender.deadline);
  const procedureTypeLabel = mapProcedureType(tender.procedureType);
  const sector = sectorLabelForCpv(tender.cpvCodes, tSector);

  const facts: { label: string; value: string | null }[] = [
    { label: t("deadline"), value: formatDate(tender.deadline) },
    { label: t("published"), value: formatDate(tender.publicationDate) },
    { label: t("estValue"), value: tender.totalValue },
    { label: t("procedureType"), value: procedureTypeLabel },
    { label: t("sector"), value: sector ?? (tender.cpvCodes[0] || null) },
    { label: t("region"), value: tender.region },
  ];

  return (
    <div className="border border-line rounded-2xl p-6 bg-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-inkDim">
            {t("ref", { ref: tender.publicationNumber })}
          </p>
          <h1 className="font-display font-bold text-3xl text-ink mt-1 leading-tight tracking-tight">
            {tender.title}
          </h1>
          <p className="text-sm text-inkDim mt-1.5">{tender.buyerName}</p>
        </div>
        <span
          className={`inline-flex items-center text-xs font-semibold border rounded-full px-2.5 py-1 shrink-0 ${STATUS_STYLE[status]}`}
        >
          {tStatus(status)}
        </span>
      </div>

      {score && <MatchScoreBadge score={score} />}

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 border-y border-line py-4">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-[10px] font-medium uppercase text-inkDim">{fact.label}</dt>
            <dd className={`text-sm mt-0.5 ${fact.value ? "text-ink" : "text-inkDim italic"}`}>
              {fact.value ?? t("notPublished")}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
          {t("objectOfContract")}
        </p>
        {tender.description ? (
          <ExpandableText
            text={tender.description}
            readMoreLabel={t("readMore")}
            readLessLabel={t("readLess")}
          />
        ) : (
          <p className="text-sm text-inkDim italic">{t("descriptionNotPublished")}</p>
        )}
      </div>
    </div>
  );
}
