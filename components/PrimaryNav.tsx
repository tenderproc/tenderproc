"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/opportunities", label: "Opportunities" },
  { href: "/workflow", label: "Workflow" },
  { href: "/search", label: "Search" },
  { href: "/market", label: "Market overview" },
];

export default function PrimaryNav() {
  const pathname = usePathname();

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
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
