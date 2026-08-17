"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function AdvancedSearchForm() {
  const t = useTranslations("AdvancedSearchForm");
  const router = useRouter();
  const params = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const [cpv, setCpv] = useState(params.get("cpv") ?? "");
  const [valueMin, setValueMin] = useState(params.get("valueMin") ?? "");
  const [valueMax, setValueMax] = useState(params.get("valueMax") ?? "");
  const [deadlineAfter, setDeadlineAfter] = useState(params.get("deadlineAfter") ?? "");
  const [deadlineBefore, setDeadlineBefore] = useState(params.get("deadlineBefore") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (keyword) next.set("q", keyword);
    if (cpv) next.set("cpv", cpv);
    if (valueMin) next.set("valueMin", valueMin);
    if (valueMax) next.set("valueMax", valueMax);
    if (deadlineAfter) next.set("deadlineAfter", deadlineAfter);
    if (deadlineBefore) next.set("deadlineBefore", deadlineBefore);
    router.push(`/search?${next.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="border border-line bg-white rounded-2xl p-5 mb-8 grid gap-4 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("keyword")}
        </label>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t("keywordPlaceholder")}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("cpvCode")}
        </label>
        <input
          value={cpv}
          onChange={(e) => setCpv(e.target.value)}
          placeholder={t("cpvPlaceholder")}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            {t("minValue")}
          </label>
          <input
            type="number"
            min={0}
            value={valueMin}
            onChange={(e) => setValueMin(e.target.value)}
            placeholder="0"
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            {t("maxValue")}
          </label>
          <input
            type="number"
            min={0}
            value={valueMax}
            onChange={(e) => setValueMax(e.target.value)}
            placeholder={t("noLimit")}
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("deadlineAfter")}
        </label>
        <input
          type="date"
          value={deadlineAfter}
          onChange={(e) => setDeadlineAfter(e.target.value)}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("deadlineBefore")}
        </label>
        <input
          type="date"
          value={deadlineBefore}
          onChange={(e) => setDeadlineBefore(e.target.value)}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>

      <div className="sm:col-span-2">
        <button className="bg-accent text-white px-5 py-2 rounded-doc font-medium shadow-xs hover:bg-accentDim transition-colors">
          {t("search")}
        </button>
      </div>
    </form>
  );
}
