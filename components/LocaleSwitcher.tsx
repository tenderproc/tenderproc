"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/locales";
import FlagIcon from "@/components/FlagIcon";

export default function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function selectLocale(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    setPending(true);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    router.refresh();
    setPending(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("label")}
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex items-center gap-1 hover:text-ink transition-colors disabled:opacity-50"
      >
        <FlagIcon locale={locale} />
        <span className="hidden sm:inline">{LOCALE_META[locale].label}</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-20 min-w-[9rem] border border-line bg-paper rounded-doc shadow-sm overflow-hidden">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => selectLocale(code)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-paperDim transition-colors ${
                  code === locale ? "text-ink font-medium" : "text-inkDim"
                }`}
              >
                <FlagIcon locale={code} />
                {LOCALE_META[code].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
