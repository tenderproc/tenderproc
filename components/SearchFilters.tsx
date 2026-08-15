"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function SearchFilters() {
  const t = useTranslations("SearchFilters");
  const router = useRouter();
  const params = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const [cpv, setCpv] = useState(params.get("cpv") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (keyword) next.set("q", keyword);
    if (cpv) next.set("cpv", cpv);
    router.push(`/opportunities?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-3 mb-8">
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder={t("keywordPlaceholder")}
        className="flex-1 min-w-[220px] border border-line rounded-doc px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
      />
      <input
        value={cpv}
        onChange={(e) => setCpv(e.target.value)}
        placeholder={t("cpvPlaceholder")}
        className="w-48 border border-line rounded-doc px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
      />
      <button className="bg-accent text-white px-5 py-2 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors">
        {t("search")}
      </button>
    </form>
  );
}
