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
  initialLanguages,
  initialStrictLanguageFilter,
}: {
  userId: string;
  initialSectors: string[];
  initialLanguages: string[];
  initialStrictLanguageFilter: boolean;
}) {
  const t = useTranslations("PreferencesSidebar");
  const tSector = useTranslations("Enums.sector");
  const tLanguage = useTranslations("Enums.language");
  const router = useRouter();
  const [sectors, setSectors] = useState(initialSectors);
  const [languages, setLanguages] = useState(initialLanguages);
  const [strictLanguageFilter, setStrictLanguageFilter] = useState(initialStrictLanguageFilter);
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
        languages,
        strict_language_filter: strictLanguageFilter,
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
  }, [sectors, languages, strictLanguageFilter]);

  function toggleSector(key: string) {
    setSectors((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function toggleLanguage(key: string) {
    setLanguages((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  return (
    <aside className="w-full md:w-60 shrink-0 md:sticky md:top-24 md:self-start border border-line rounded-2xl bg-white p-5">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">
          {t("sectors")}
        </p>
        <div className="space-y-2">
          {SECTORS.map((sector) => (
            <label
              key={sector.key}
              className="flex items-center gap-2 text-sm text-ink cursor-pointer"
            >
              <input
                type="checkbox"
                className="accent-accent"
                checked={sectors.includes(sector.key)}
                onChange={() => toggleSector(sector.key)}
              />
              {tSector(sector.key)}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">
          {t("languages")}
        </p>
        <p className="text-xs text-inkDim mb-3 -mt-2">{t("languagesHint")}</p>
        <div className="space-y-2">
          {LANGUAGES.map((language) => (
            <label
              key={language.key}
              className="flex items-center gap-2 text-sm text-ink cursor-pointer"
            >
              <input
                type="checkbox"
                className="accent-accent"
                checked={languages.includes(language.key)}
                onChange={() => toggleLanguage(language.key)}
              />
              {tLanguage(language.key)}
            </label>
          ))}
        </div>

        <label className="flex items-start gap-2 text-sm text-ink cursor-pointer mt-4 pt-4 border-t border-line">
          <input
            type="checkbox"
            className="accent-accent mt-0.5"
            checked={strictLanguageFilter}
            onChange={() => setStrictLanguageFilter((v) => !v)}
          />
          <span>
            {t("strictLanguageFilter")}
            <span className="block text-xs text-inkDim mt-0.5">{t("strictLanguageFilterHint")}</span>
          </span>
        </label>
      </div>

      <p className="text-xs text-inkDim mt-5 h-4">
        {saving ? t("saving") : error ? <span className="text-stamp">{error}</span> : " "}
      </p>
    </aside>
  );
}
