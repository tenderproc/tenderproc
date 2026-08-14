"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface DocumentRow {
  id: string;
  file_name: string;
  storage_path: string;
  file_type: string | null;
  file_size_bytes: number | null;
  uploaded_at: string;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsSection({
  userId,
  companyId,
  initialDocuments,
}: {
  userId: string;
  companyId: string;
  initialDocuments: DocumentRow[];
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    const supabase = createClient();
    const path = `${userId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("company-documents")
      .upload(path, file);
    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { error: dbError } = await supabase.from("company_documents").insert({
      company_id: companyId,
      file_name: file.name,
      storage_path: path,
      file_type: file.type || null,
      file_size_bytes: file.size,
    });
    setUploading(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    router.refresh();
  }

  async function remove(doc: DocumentRow) {
    const supabase = createClient();
    await supabase.storage.from("company-documents").remove([doc.storage_path]);
    await supabase.from("company_documents").delete().eq("id", doc.id);
    router.refresh();
  }

  return (
    <div className="border border-line bg-white rounded-2xl p-6">
      <h3 className="font-display font-semibold text-base text-ink mb-3">Documents</h3>
      <p className="text-xs text-inkDim mb-4 -mt-2">
        Supporting evidence (certificates, brochures, policies) you can link
        to certifications and references above.
      </p>

      {initialDocuments.length === 0 ? (
        <p className="text-sm text-inkDim mb-4">Nothing uploaded yet.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {initialDocuments.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm"
            >
              <div className="min-w-0">
                <p className="text-ink font-medium truncate">{d.file_name}</p>
                <p className="text-inkDim text-xs">{formatSize(d.file_size_bytes)}</p>
              </div>
              <button
                onClick={() => remove(d)}
                className="text-xs text-stamp hover:underline shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="inline-block text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors cursor-pointer">
        {uploading ? "Uploading…" : "Upload document"}
        <input type="file" className="hidden" onChange={onFileChange} disabled={uploading} />
      </label>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
