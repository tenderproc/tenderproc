"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { SECTORS } from "@/lib/sectors";
import { LANGUAGES } from "@/lib/languages";

export default function PreferencesSidebar({
  userId,
  initialSectors,
  initialLanguage,
  sectorLimit,
}: {
  userId: string;
  initialSectors: string[];
  initialLanguage: string | null;
  /** Free plan's sector cap ("/pricing": "Opportunities feed for 1 sector"),
   * or null for unlimited (Pro/Premium). The server page already applies
   * this to what's actually queried — this only keeps the checkboxes from
   * letting a Free user select more than they'll get results for. */
  sectorLimit: number | null;
}) {
  const t = useTranslations("PreferencesSidebar");
  const tSector = useTranslations("Enums.sector");
  const tLanguage = useTranslations("Enums.language");
  const router = useRouter();
  const [sectors, setSectors] = useState(initialSectors);
  const [language, setLanguage] = useState<string | null>(initialLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const skipFirst = useRef(true);

  // Live-save on every change (debounced) and refresh the dashboard's
  // server-rendered results so the tender list reflects the new selection
  // without a separate "Save" step. router.refresh() itself can take several
  // seconds (it re-fetches TED/BOSA/regional sources + match scores), so it's
  // wrapped in a transition — otherwise `saving` flips off right after the
  // DB write and the sidebar looks idle while the list is still updating.
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      setSaving(true);
      setError(null);
      const supabase = createClient();
      const now = new Date().toISOString();
      // Sectors go to companies.sector_keys — the same field Opportunities
      // matching reads (see lib/companyProfile.ts) — not profiles.sectors,
      // which is no longer read by anything. Plain .update(), not
      // .upsert(): every user is guaranteed a companies row by the backfill
      // migration + signup seeding, and companies.name is NOT NULL, so an
      // upsert here without a name would fail on the (never-taken) insert
      // path for a user who somehow lacked a row.
      //
      // sectorLimit is re-applied here (not just at read time in
      // app/opportunities/page.tsx) so a Free-tier account can't end up
      // storing more sectors than its plan allows via this write path —
      // still bypassable by a direct API call, but closes the normal-UI gap.
      const cappedSectors = sectorLimit !== null ? sectors.slice(0, sectorLimit) : sectors;
      const [{ error: companyError }, { error: profileError }] = await Promise.all([
        supabase
          .from("companies")
          .update({ sector_keys: cappedSectors, updated_at: now })
          .eq("user_id", userId),
        supabase.from("profiles").upsert({ id: userId, language, updated_at: now }),
      ]);
      setSaving(false);
      const error = companyError ?? profileError;
      if (error) {
        setError(error.message);
        return;
      }
      startRefresh(() => {
        router.refresh();
      });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectors, language]);

  const atSectorLimit = sectorLimit !== null && sectors.length >= sectorLimit;

  function toggleSector(key: string) {
    setSectors((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (sectorLimit !== null && prev.length >= sectorLimit) return prev;
      return [...prev, key];
    });
  }

  return (
    <aside className="w-full md:w-60 shrink-0 md:sticky md:top-24 md:self-start md:max-h-[calc(100vh-7rem)] md:overflow-y-auto border border-line rounded-2xl bg-white p-4">
      <details className="group mb-4" open>
        <summary className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-inkDim mb-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          {t("sectors")}
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="h-3.5 w-3.5 shrink-0 text-inkDim transition-transform group-open:rotate-180"
          >
            <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="space-y-1">
          {SECTORS.map((sector) => {
            const checked = sectors.includes(sector.key);
            const disabled = !checked && atSectorLimit;
            return (
              <label
                key={sector.key}
                className={`flex items-start gap-2 text-[13px] leading-snug text-ink ${
                  disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-accent mt-0.5 h-3.5 w-3.5 shrink-0"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleSector(sector.key)}
                />
                {tSector(sector.key)}
              </label>
            );
          })}
        </div>
        {sectorLimit !== null && (
          <p className="text-[11px] text-inkDim mt-2">
            {t("sectorLimitFree", { limit: sectorLimit })}{" "}
            <a href="/pricing" className="underline hover:text-ink transition-colors">
              {t("sectorLimitUpgrade")}
            </a>
          </p>
        )}
      </details>

      <details className="group" open>
        <summary className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-inkDim mb-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          {t("languages")}
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="h-3.5 w-3.5 shrink-0 text-inkDim transition-transform group-open:rotate-180"
          >
            <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        {/* Exclusive single-select: exactly one of "All languages" or a
         * specific language is active at a time — a native radio group gets
         * this right (mutual exclusion, keyboard/screen-reader support) for
         * free instead of hand-rolling toggle logic that could double-select. */}
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-[13px] leading-snug text-ink cursor-pointer">
            <input
              type="radio"
              name="language-filter"
              className="accent-accent h-3.5 w-3.5 shrink-0"
              checked={language === null}
              onChange={() => setLanguage(null)}
            />
            {t("allLanguages")}
          </label>
          {LANGUAGES.map((lang) => (
            <label
              key={lang.key}
              className="flex items-center gap-2 text-[13px] leading-snug text-ink cursor-pointer"
            >
              <input
                type="radio"
                name="language-filter"
                className="accent-accent h-3.5 w-3.5 shrink-0"
                checked={language === lang.key}
                onChange={() => setLanguage(lang.key)}
              />
              {tLanguage(lang.key)}
            </label>
          ))}
        </div>
      </details>

      <p className="text-xs text-inkDim mt-3 h-4">
        {saving
          ? t("saving")
          : isRefreshing
          ? t("filtering")
          : error
          ? <span className="text-stamp">{error}</span>
          : " "}
      </p>
    </aside>
  );
}
