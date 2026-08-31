"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import LocaleSwitcher from "@/components/LocaleSwitcher";

// The pricing page's own hamburger menu — separate from the app-wide
// MobileMenu (components/MobileMenu.tsx), which always renders the
// authenticated tab set + sign-out and would be wrong here: /pricing is
// reachable both signed-out (needs login/signup links) and signed-in (needs
// a "go to app" link), unlike the rest of the app shell. Fixes the pricing
// header's mobile-only horizontal overflow (its desktop nav row didn't fit
// at narrow viewports and had no fallback — see the QA audit's persona 3
// finding), by mirroring the same hidden-on-desktop-collapse pattern.
export default function PricingMobileMenu({
  isLoggedIn,
}: {
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Pricing");
  const tHeader = useTranslations("Header");
  const tLegal = useTranslations("Legal");

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? tHeader("menuClose") : tHeader("menuOpen")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-9 h-9 -mr-1 text-ink"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-ink/20 cursor-default"
          />
          <div className="fixed inset-y-0 right-0 z-40 w-72 max-w-[85vw] bg-paper border-l border-line shadow-xs overflow-y-auto">
            <nav className="flex flex-col py-2">
              {isLoggedIn ? (
                <Link
                  href="/opportunities"
                  className="px-5 py-3 text-sm font-medium text-ink hover:bg-paperDim transition-colors"
                >
                  {t("goToApp")} →
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-5 py-3 text-sm font-medium text-ink hover:bg-paperDim transition-colors"
                  >
                    {t("logIn")}
                  </Link>
                  <Link
                    href="/signup"
                    className="px-5 py-3 text-sm font-medium text-ink hover:bg-paperDim transition-colors"
                  >
                    {t("signUp")}
                  </Link>
                </>
              )}

              <Link
                href="/contact"
                className="px-5 py-3 text-sm text-inkDim hover:text-ink hover:bg-paperDim transition-colors"
              >
                {tLegal("contact")}
              </Link>

              <div className="my-2 border-t border-line" />

              <div className="px-5 py-2">
                <LocaleSwitcher />
              </div>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
