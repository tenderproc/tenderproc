"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
}

export default function ServicesSection({
  companyId,
  initialServices,
}: {
  companyId: string;
  initialServices: ServiceRow[];
}) {
  const t = useTranslations("ServicesSection");
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from("company_services").insert({
      company_id: companyId,
      name: name.trim(),
      description: description.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setDescription("");
    router.refresh();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("company_services").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="border border-line bg-white rounded-2xl p-6">
      <h3 className="font-display font-semibold text-base text-ink mb-3">{t("heading")}</h3>

      {initialServices.length === 0 ? (
        <p className="text-sm text-inkDim mb-4">{t("nothingAdded")}</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {initialServices.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 border-b border-line pb-2 text-sm"
            >
              <div>
                <p className="text-ink font-medium">{s.name}</p>
                {s.description && <p className="text-inkDim mt-0.5">{s.description}</p>}
              </div>
              <button
                onClick={() => remove(s.id)}
                className="text-xs text-stamp hover:underline shrink-0"
              >
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          className="flex-1 border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          className="flex-1 border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <button
          disabled={saving}
          className="text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors disabled:opacity-50 shrink-0"
        >
          {t("add")}
        </button>
      </form>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
