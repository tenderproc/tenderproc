"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TABS } from "./PrimaryNav";
import SignOutButton from "./SignOutButton";
import LocaleSwitcher from "./LocaleSwitcher";

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("Nav");
  const tHeader = useTranslations("Header");
  const tLegal = useTranslations("Legal");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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
              {TABS.map((tab) => {
                const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`px-5 py-3 text-sm font-medium border-l-2 transition-colors ${
                      active
                        ? "border-accent text-ink bg-paperDim"
                        : "border-transparent text-inkDim hover:text-ink hover:bg-paperDim"
                    }`}
                  >
                    {t(tab.key)}
                  </Link>
                );
              })}

              <div className="my-2 border-t border-line" />

              <Link
                href="/pricing"
                className="px-5 py-3 text-sm text-inkDim hover:text-ink hover:bg-paperDim transition-colors"
              >
                {tHeader("pricing")}
              </Link>
              <Link
                href="/billing"
                className="px-5 py-3 text-sm text-inkDim hover:text-ink hover:bg-paperDim transition-colors"
              >
                {tHeader("billing")}
              </Link>
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
              <div className="px-5 py-3 text-sm text-inkDim hover:text-ink transition-colors">
                <SignOutButton />
              </div>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
