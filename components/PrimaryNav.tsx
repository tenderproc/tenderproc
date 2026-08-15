"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const TABS = [
  { href: "/opportunities", key: "opportunities" },
  { href: "/workflow", key: "workflow" },
  { href: "/search", key: "search" },
  { href: "/market", key: "market" },
  { href: "/my-tenders", key: "tenders" },
  { href: "/bids", key: "bids" },
  { href: "/company", key: "company" },
] as const;

export default function PrimaryNav() {
  const pathname = usePathname();
  const t = useTranslations("Nav");

  return (
    <nav className="max-w-6xl mx-auto px-6 flex items-center gap-1 border-t border-line -mb-px overflow-x-auto">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              active
                ? "border-accent text-ink"
                : "border-transparent text-inkDim hover:text-ink"
            }`}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
