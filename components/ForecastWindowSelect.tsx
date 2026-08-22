"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FORECAST_WINDOW_OPTIONS } from "@/lib/forecast/window";

export default function ForecastWindowSelect({ months }: { months: number }) {
  const t = useTranslations("ForecastPage");
  const router = useRouter();

  return (
    <label className="text-sm text-inkDim flex items-center gap-2">
      {t("windowLabel")}
      <select
        value={months}
        onChange={(e) => router.push(`/forecast?months=${e.target.value}`)}
        className="border border-line rounded-doc px-2 py-1.5 bg-white text-sm focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
      >
        {FORECAST_WINDOW_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {t("windowMonths", { months: m })}
          </option>
        ))}
      </select>
    </label>
  );
}
