"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface CertificationRow {
  id: string;
  name: string;
  issuing_organization: string | null;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
}

function expiryBadge(expiryDate: string | null) {
  if (!expiryDate) return null;
  const daysLeft = (new Date(expiryDate).getTime() - Date.now()) / 86400000;
  if (daysLeft < 0) {
    return <span className="text-xs font-medium text-stamp">Expired</span>;
  }
  if (daysLeft <= 60) {
    return <span className="text-xs font-medium text-gold">Expires soon</span>;
  }
  return <span className="text-xs font-medium text-moss">Valid</span>;
}

export default function CertificationsSection({
  companyId,
  initialCertifications,
}: {
  companyId: string;
  initialCertifications: CertificationRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [issuingOrganization, setIssuingOrganization] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from("company_certifications").insert({
      company_id: companyId,
      name: name.trim(),
      issuing_organization: issuingOrganization.trim() || null,
      certificate_number: certificateNumber.trim() || null,
      expiry_date: expiryDate || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setIssuingOrganization("");
    setCertificateNumber("");
    setExpiryDate("");
    router.refresh();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("company_certifications").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="border border-line bg-white rounded-2xl p-6">
      <h3 className="font-display font-semibold text-base text-ink mb-3">Certifications</h3>

      {initialCertifications.length === 0 ? (
        <p className="text-sm text-inkDim mb-4">Nothing added yet.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {initialCertifications.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 border-b border-line pb-2 text-sm"
            >
              <div>
                <p className="text-ink font-medium flex items-center gap-2">
                  {c.name} {expiryBadge(c.expiry_date)}
                </p>
                <p className="text-inkDim mt-0.5">
                  {[c.issuing_organization, c.certificate_number, c.expiry_date && `expires ${c.expiry_date}`]
                    .filter(Boolean)
                    .join(" · ") || "No further details"}
                </p>
              </div>
              <button
                onClick={() => remove(c.id)}
                className="text-xs text-stamp hover:underline shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid sm:grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Certification name, e.g. ISO 9001"
          className="border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <input
          value={issuingOrganization}
          onChange={(e) => setIssuingOrganization(e.target.value)}
          placeholder="Issuing organization (optional)"
          className="border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <input
          value={certificateNumber}
          onChange={(e) => setCertificateNumber(e.target.value)}
          placeholder="Certificate number (optional)"
          className="border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <button
          disabled={saving}
          className="sm:col-span-2 text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
