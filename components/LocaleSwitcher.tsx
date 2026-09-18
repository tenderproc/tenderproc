"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/locales";
import { usePathname, useRouter } from "@/i18n/navigation";
import FlagIcon from "@/components/FlagIcon";

export default function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale() as Locale;
  const router = useRouter();
  // Locale-aware: this is the pathname *without* the locale prefix, so it can
  // be handed straight back to router.replace() with a different locale.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape should dismiss the open dropdown and return focus to the toggle,
  // matching standard popup keyboard behavior — previously only the
  // click-outside handler below could close it (see the QA audit's
  // accessibility-persona finding).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Locale is part of the URL now (see i18n/routing.ts) rather than a cookie,
  // so switching it is a navigation to the same page under the other locale's
  // prefix — next-intl's router adds/strips the prefix per `as-needed`, so
  // English lands back on the un-prefixed URL. Dynamic segments (e.g.
  // /bids/[bidId]) have to be passed through `params`, and the query string is
  // preserved so filters/plan selections survive the switch.
  function selectLocale(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    const query = Object.fromEntries(searchParams.entries());
    startTransition(() => {
      router.replace({ pathname, query }, { locale: next });
    });
  }

  return (
    <div className="relative">
      <button
        ref={toggleRef}
        type="button"
        aria-label={t("label")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
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
          {/* left-anchored on narrow screens (this switcher sits near the
              left edge of the mobile header, and right-0 alone pushed the
              menu mostly off-screen there — measured at left:-99px on a
              390px viewport), right-anchored again from sm: up where the
              switcher sits near the right edge instead. */}
          <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 z-20 min-w-36 border border-line bg-paper rounded-doc shadow-xs overflow-hidden">
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
