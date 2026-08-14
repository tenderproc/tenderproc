"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SECTORS } from "@/lib/sectors";
import { LANGUAGES } from "@/lib/languages";

export default function PreferencesSidebar({
  userId,
  initialSectors,
  initialLanguages,
}: {
  userId: string;
  initialSectors: string[];
  initialLanguages: string[];
}) {
  const router = useRouter();
  const [sectors, setSectors] = useState(initialSectors);
  const [languages, setLanguages] = useState(initialLanguages);
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
  }, [sectors, languages]);

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
          Sectors
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
              {sector.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">
          Languages
        </p>
        <p className="text-xs text-inkDim mb-3 -mt-2">
          Controls which translation titles are shown in — every tender stays
          visible either way.
        </p>
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
              {language.label}
            </label>
          ))}
        </div>
      </div>

      <p className="text-xs text-inkDim mt-5 h-4">
        {saving ? "Saving…" : error ? <span className="text-stamp">{error}</span> : " "}
      </p>
    </aside>
  );
}
