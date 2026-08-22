"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SECTORS } from "@/lib/sectors";
import { MARKET_SHARE_WINDOW_OPTIONS } from "@/lib/marketShare/window";

export default function MarketShareFilters({
  selectedSectors,
  months,
}: {
  selectedSectors: string[];
  months: number;
}) {
  const t = useTranslations("MarketShare");
  const tSector = useTranslations("Enums.sector");
  const router = useRouter();
  const searchParams = useSearchParams();

  function pushParams(next: { sectors?: string[]; months?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    const sectors = next.sectors ?? selectedSectors;
    const windowMonths = next.months ?? months;
    if (sectors.length > 0) {
      params.set("shareSectors", sectors.join(","));
    } else {
      params.delete("shareSectors");
    }
    params.set("shareMonths", String(windowMonths));
    router.push(`/market?${params.toString()}#market-share`);
  }

  function toggleSector(key: string) {
    const next = selectedSectors.includes(key)
      ? selectedSectors.filter((k) => k !== key)
      : [...selectedSectors, key];
    pushParams({ sectors: next });
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
      <div className="flex flex-wrap gap-2">
        {SECTORS.map((sector) => (
          <button
            key={sector.key}
            onClick={() => toggleSector(sector.key)}
            className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors ${
              selectedSectors.includes(sector.key)
                ? "bg-accent/10 border-accent/40 text-accent"
                : "border-line text-inkDim hover:text-ink"
            }`}
          >
            {tSector(sector.key)}
          </button>
        ))}
      </div>
      <label className="text-sm text-inkDim flex items-center gap-2 shrink-0">
        {t("windowLabel")}
        <select
          value={months}
          onChange={(e) => pushParams({ months: Number(e.target.value) })}
          className="border border-line rounded-doc px-2 py-1.5 bg-white text-sm focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        >
          {MARKET_SHARE_WINDOW_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {t("windowMonths", { months: m })}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
