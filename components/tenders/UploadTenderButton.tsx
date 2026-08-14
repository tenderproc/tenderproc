"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadTenderButton() {
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
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      router.push(`/my-tenders/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="inline-block bg-accent text-white px-5 py-2.5 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors cursor-pointer disabled:opacity-50">
        {uploading ? "Uploading & analyzing… (up to a minute)" : "Upload tender"}
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
