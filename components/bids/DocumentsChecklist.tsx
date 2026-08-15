"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export interface BidDocumentRow {
  id: string;
  name: string;
  status: string;
  storage_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsChecklist({
  bidId,
  userId,
  initialDocuments,
}: {
  bidId: string;
  userId: string;
  initialDocuments: BidDocumentRow[];
}) {
  const t = useTranslations("DocumentsChecklist");
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleStatus(doc: BidDocumentRow) {
    const next = doc.status === "READY" ? "MISSING" : "READY";
    setBusyId(doc.id);
    const supabase = createClient();
    await supabase.from("bid_documents").update({ status: next }).eq("id", doc.id);
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: next } : d)));
    setBusyId(null);
    router.refresh();
  }

  async function onFileChange(doc: BidDocumentRow, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusyId(doc.id);
    setError(null);
    const supabase = createClient();
    const path = `${userId}/${bidId}/${doc.id}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("bid-documents")
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setBusyId(null);
      setError(uploadError.message);
      return;
    }

    const uploadedAt = new Date().toISOString();
    await supabase
      .from("bid_documents")
      .update({
        status: "READY",
        storage_path: path,
        file_name: file.name,
        file_size_bytes: file.size,
        uploaded_at: uploadedAt,
      })
      .eq("id", doc.id);

    setDocuments((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? { ...d, status: "READY", storage_path: path, file_name: file.name, file_size_bytes: file.size }
          : d
      )
    );
    setBusyId(null);
    router.refresh();
  }

  async function download(doc: BidDocumentRow) {
    if (!doc.storage_path) return;
    const supabase = createClient();
    const { data, error: signError } = await supabase.storage
      .from("bid-documents")
      .createSignedUrl(doc.storage_path, 60);
    if (signError || !data) {
      setError(signError?.message ?? t("couldNotOpenFile"));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (documents.length === 0) {
    return (
      <div className="border border-line bg-white rounded-2xl p-6">
        <h2 className="font-display font-semibold text-lg text-ink mb-1">{t("heading")}</h2>
        <p className="text-sm text-inkDim">{t("noneExtracted")}</p>
      </div>
    );
  }

  const readyCount = documents.filter((d) => d.status === "READY").length;

  return (
    <div className="border border-line bg-white rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-lg text-ink">{t("heading")}</h2>
        <span className="text-sm text-inkDim">
          {t("readyCount", { ready: readyCount, total: documents.length })}
        </span>
      </div>
      <ul className="space-y-2">
        {documents.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-3 border border-line rounded-doc p-3 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${d.status === "READY" ? "bg-moss" : "bg-line"}`}
              />
              <div className="min-w-0">
                <p className="text-ink font-medium truncate">{d.name}</p>
                {d.file_name && (
                  <p className="text-inkDim text-xs truncate">
                    {d.file_name} {formatSize(d.file_size_bytes)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {d.storage_path && (
                <button
                  onClick={() => download(d)}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {t("download")}
                </button>
              )}
              <label className="text-xs font-medium text-ink border border-line rounded-doc px-2 py-1.5 hover:bg-paperDim transition-colors cursor-pointer">
                {busyId === d.id ? t("uploading") : t("upload")}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => onFileChange(d, e)}
                  disabled={busyId === d.id}
                />
              </label>
              <button
                onClick={() => toggleStatus(d)}
                disabled={busyId === d.id}
                className="text-xs font-medium text-inkDim border border-line rounded-doc px-2 py-1.5 hover:bg-paperDim transition-colors disabled:opacity-50"
              >
                {d.status === "READY" ? t("markMissing") : t("markReady")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-stamp mt-3">{error}</p>}
    </div>
  );
}
