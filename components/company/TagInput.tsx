"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const t = useTranslations("TagInput");
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setDraft("");
  }

  function remove(tag: string) {
    onChange(values.filter((v) => v !== tag));
  }

  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs font-medium border border-line rounded-full px-2.5 py-1 text-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-inkDim hover:text-stamp"
              aria-label={t("removeTag", { tag })}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder ?? t("defaultPlaceholder")}
        className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
      />
    </div>
  );
}
