"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { SECTORS } from "@/lib/sectors";
import { LANGUAGES } from "@/lib/languages";

export default function PreferencesSidebar({
  userId,
  initialSectors,
  initialLanguage,
}: {
  userId: string;
  initialSectors: string[];
  initialLanguage: string | null;
}) {
  const t = useTranslations("PreferencesSidebar");
  const tSector = useTranslations("Enums.sector");
  const tLanguage = useTranslations("Enums.language");
  const router = useRouter();
  const [sectors, setSectors] = useState(initialSectors);
  const [language, setLanguage] = useState<string | null>(initialLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipFirst = useRef(true);

  // Live-save on every change (debounced) and refresh the dashboard's
  // server-rendered results so the tender list reflects the new selection
  // without a separate "Save" step.
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      setSaving(true);
      setError(null);
      const supabase = createClient();
      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        sectors,
        language,
        updated_at: new Date().toISOString(),
      });
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.refresh();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectors, language]);

  function toggleSector(key: string) {
    setSectors((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
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
          {SECTORS.map((sector) => (
            <label
              key={sector.key}
              className="flex items-start gap-2 text-[13px] leading-snug text-ink cursor-pointer"
            >
              <input
                type="checkbox"
                className="accent-accent mt-0.5 h-3.5 w-3.5 shrink-0"
                checked={sectors.includes(sector.key)}
                onChange={() => toggleSector(sector.key)}
              />
              {tSector(sector.key)}
            </label>
          ))}
        </div>
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
        {saving ? t("saving") : error ? <span className="text-stamp">{error}</span> : " "}
      </p>
    </aside>
  );
}
