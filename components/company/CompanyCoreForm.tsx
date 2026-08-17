"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { COMPANY_SIZES } from "@/lib/companySizes";
import TagInput from "./TagInput";

export default function CompanyCoreForm({
  userId,
  hasCompany,
  initial,
}: {
  userId: string;
  hasCompany: boolean;
  initial: {
    name: string;
    description: string;
    website: string;
    companySize: string;
    employeeCount: string;
    regionsServed: string[];
    languages: string[];
    industries: string[];
  };
}) {
  const t = useTranslations("CompanyCoreForm");
  const tCompanySize = useTranslations("Enums.companySize");
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [website, setWebsite] = useState(initial.website);
  const [companySize, setCompanySize] = useState(initial.companySize);
  const [employeeCount, setEmployeeCount] = useState(initial.employeeCount);
  const [regionsServed, setRegionsServed] = useState(initial.regionsServed);
  const [languages, setLanguages] = useState(initial.languages);
  const [industries, setIndustries] = useState(initial.industries);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    const supabase = createClient();
    const { error } = await supabase.from("companies").upsert(
      {
        user_id: userId,
        name: name.trim(),
        description: description.trim() || null,
        website: website.trim() || null,
        company_size: companySize || null,
        employee_count: employeeCount ? Number(employeeCount) : null,
        regions_served: regionsServed,
        languages,
        industries,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-line bg-white rounded-2xl p-6 space-y-4"
    >
      <div>
        <h2 className="font-display font-semibold text-lg text-ink">{t("heading")}</h2>
        <p className="text-sm text-inkDim mt-1">{t("subheading")}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            {t("companyName")}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            {t("website")}
          </label>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("description")}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder={t("descriptionPlaceholder")}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            {t("companySize")}
          </label>
          <select
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value)}
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
          >
            <option value="">{t("preferNotToSay")}</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s.key} value={s.key}>
                {tCompanySize(s.key)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            {t("employeeCount")}
          </label>
          <input
            type="number"
            min={0}
            value={employeeCount}
            onChange={(e) => setEmployeeCount(e.target.value)}
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <TagInput
          label={t("regionsServed")}
          values={regionsServed}
          onChange={setRegionsServed}
          placeholder={t("regionsServedPlaceholder")}
        />
        <TagInput
          label={t("languages")}
          values={languages}
          onChange={setLanguages}
          placeholder={t("languagesPlaceholder")}
        />
        <TagInput
          label={t("industries")}
          values={industries}
          onChange={setIndustries}
          placeholder={t("industriesPlaceholder")}
        />
      </div>

      {error && <p className="text-sm text-stamp">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          disabled={saving}
          className="bg-accent text-white px-5 py-2.5 rounded-doc font-medium shadow-xs hover:bg-accentDim transition-colors disabled:opacity-50"
        >
          {saving ? t("saving") : hasCompany ? t("saveChanges") : t("createProfile")}
        </button>
        {saved && !saving && <span className="text-sm text-moss">{t("saved")}</span>}
      </div>
    </form>
  );
}
