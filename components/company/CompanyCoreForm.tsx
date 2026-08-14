"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TagInput from "./TagInput";

const COMPANY_SIZES = [
  { key: "solo", label: "Solo / freelance" },
  { key: "1-9", label: "1–9 employees" },
  { key: "10-49", label: "10–49 employees" },
  { key: "50-249", label: "50–249 employees" },
];

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
      setError("Company name is required.");
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
        <h2 className="font-display font-semibold text-lg text-ink">Company profile</h2>
        <p className="text-sm text-inkDim mt-1">
          This is the knowledge base the AI uses when analyzing tenders and
          drafting responses — it never uses information beyond what&apos;s
          entered here.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            Company name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            Website
          </label>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What does the company do, and for whom?"
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            Company size
          </label>
          <select
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value)}
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          >
            <option value="">Prefer not to say</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
            Employee count (exact, optional)
          </label>
          <input
            type="number"
            min={0}
            value={employeeCount}
            onChange={(e) => setEmployeeCount(e.target.value)}
            className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <TagInput
          label="Regions served"
          values={regionsServed}
          onChange={setRegionsServed}
          placeholder="e.g. Antwerp"
        />
        <TagInput
          label="Languages"
          values={languages}
          onChange={setLanguages}
          placeholder="e.g. Dutch"
        />
        <TagInput
          label="Industries"
          values={industries}
          onChange={setIndustries}
          placeholder="e.g. Facility management"
        />
      </div>

      {error && <p className="text-sm text-stamp">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          disabled={saving}
          className="bg-accent text-white px-5 py-2.5 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : hasCompany ? "Save changes" : "Create company profile"}
        </button>
        {saved && !saving && <span className="text-sm text-moss">Saved ✓</span>}
      </div>
    </form>
  );
}
