"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

interface FollowedCompany {
  id: string;
  displayName: string;
  createdAt: string;
}

export default function FollowedCompaniesList({ companies }: { companies: FollowedCompany[] }) {
  const t = useTranslations("FollowedCompanies");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function remove(id: string) {
    setPendingId(id);
    const supabase = createClient();
    await supabase.from("followed_companies").delete().eq("id", id);
    setPendingId(null);
    router.refresh();
  }

  function formatDate(d: string) {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString(INTL_LOCALE[locale], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  if (companies.length === 0) {
    return (
      <div className="border border-line rounded-2xl p-8 text-center">
        <p className="text-inkDim">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="border border-line rounded-2xl bg-white divide-y divide-line">
      {companies.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">{c.displayName}</p>
            <p className="text-xs text-inkDim">{t("followedSince", { date: formatDate(c.createdAt) })}</p>
          </div>
          <button
            onClick={() => remove(c.id)}
            disabled={pendingId === c.id}
            className="text-xs text-stamp hover:underline disabled:opacity-50 shrink-0"
          >
            {t("remove")}
          </button>
        </div>
      ))}
    </div>
  );
}
