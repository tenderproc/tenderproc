import { getTranslations } from "next-intl/server";

/** Shown wherever forecasts are shown (list + detail) — see plan item 6: never let a forecast read as a guarantee. */
export default async function ForecastDisclaimer() {
  const t = await getTranslations("ForecastDisclaimer");
  return (
    <p className="text-xs text-inkDim border border-line rounded-doc px-3 py-2 bg-paperDim leading-relaxed">
      {t("text")}
    </p>
  );
}
