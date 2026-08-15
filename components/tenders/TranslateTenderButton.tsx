"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiErrorMessage } from "@/lib/apiErrors";
import { LOCALE_META, type Locale } from "@/lib/locales";

export default function TranslateTenderButton({ tenderId }: { tenderId: string }) {
  const t = useTranslations("TranslateTenderButton");
  const tApiError = useTranslations("Errors.api");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, tApiError, t("couldNotTranslate")));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotTranslate"));
    } finally {
      setRunning(false);
    }
  }

  const language = LOCALE_META[locale].label;

  return (
    <div className="border border-line bg-paperDim rounded-doc p-4 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-inkDim">{t("notice")}</p>
      <button
        onClick={run}
        disabled={running}
        className="text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {running ? t("translating", { language }) : t("translate", { language })}
      </button>
      {error && <p className="text-sm text-stamp w-full">{error}</p>}
    </div>
  );
}
