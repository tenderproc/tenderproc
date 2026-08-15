"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import TagInput from "./TagInput";

interface ReferenceRow {
  id: string;
  client: string;
  project_name: string | null;
  description: string | null;
  contract_value: number | null;
  is_public: boolean | null;
  services: string[] | null;
}

export default function ReferencesSection({
  companyId,
  initialReferences,
}: {
  companyId: string;
  initialReferences: ReferenceRow[];
}) {
  const t = useTranslations("ReferencesSection");
  const router = useRouter();
  const [client, setClient] = useState("");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [isPublic, setIsPublic] = useState<"" | "public" | "private">("");
  const [services, setServices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!client.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from("company_references").insert({
      company_id: companyId,
      client: client.trim(),
      project_name: projectName.trim() || null,
      description: description.trim() || null,
      contract_value: contractValue ? Number(contractValue) : null,
      is_public: isPublic === "" ? null : isPublic === "public",
      services,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setClient("");
    setProjectName("");
    setDescription("");
    setContractValue("");
    setIsPublic("");
    setServices([]);
    router.refresh();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("company_references").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="border border-line bg-white rounded-2xl p-6">
      <h3 className="font-display font-semibold text-base text-ink mb-3">{t("heading")}</h3>
      <p className="text-xs text-inkDim mb-4 -mt-2">{t("subheading")}</p>

      {initialReferences.length === 0 ? (
        <p className="text-sm text-inkDim mb-4">{t("nothingAdded")}</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {initialReferences.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 border-b border-line pb-2 text-sm"
            >
              <div>
                <p className="text-ink font-medium">
                  {r.client}
                  {r.project_name ? ` — ${r.project_name}` : ""}
                  {r.is_public !== null && (
                    <span className="ml-2 text-xs text-inkDim">
                      ({r.is_public ? t("publicSector") : t("privateSector")})
                    </span>
                  )}
                </p>
                {r.description && <p className="text-inkDim mt-0.5">{r.description}</p>}
                {r.contract_value && (
                  <p className="text-inkDim mt-0.5">
                    {t("value", { value: r.contract_value.toLocaleString() })}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(r.id)}
                className="text-xs text-stamp hover:underline shrink-0"
              >
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder={t("clientPlaceholder")}
            className="border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={t("projectNamePlaceholder")}
            className="border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            type="number"
            min={0}
            value={contractValue}
            onChange={(e) => setContractValue(e.target.value)}
            placeholder={t("contractValuePlaceholder")}
            className="border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
          <select
            value={isPublic}
            onChange={(e) => setIsPublic(e.target.value as "" | "public" | "private")}
            className="border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          >
            <option value="">{t("sectorOptional")}</option>
            <option value="public">{t("publicSector")}</option>
            <option value="private">{t("privateSector")}</option>
          </select>
        </div>
        <TagInput
          label={t("servicesLabel")}
          values={services}
          onChange={setServices}
          placeholder={t("servicesPlaceholder")}
        />
        <button
          disabled={saving}
          className="text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors disabled:opacity-50"
        >
          {t("addReference")}
        </button>
      </form>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
