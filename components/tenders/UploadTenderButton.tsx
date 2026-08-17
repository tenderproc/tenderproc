"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiErrorMessage } from "@/lib/apiErrors";

export default function UploadTenderButton() {
  const t = useTranslations("UploadTenderButton");
  const tApiError = useTranslations("Errors.api");
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tenders/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, tApiError, t("uploadFailed")));
      router.push(`/my-tenders/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadFailed"));
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="inline-block bg-accent text-white px-5 py-2.5 rounded-doc font-medium shadow-xs hover:bg-accentDim transition-colors cursor-pointer disabled:opacity-50">
        {uploading ? t("uploadingAndAnalyzing") : t("uploadTender")}
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onFileChange}
          disabled={uploading}
        />
      </label>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
