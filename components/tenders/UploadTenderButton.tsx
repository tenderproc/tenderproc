"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiErrorMessage } from "@/lib/apiErrors";

export default function UploadTenderButton() {
  const t = useTranslations("UploadTenderButton");
  const tApiError = useTranslations("Errors.api");
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<{ href: string; label: string } | null>(null);

  async function upload(file: File, confirmDuplicate: boolean) {
    const formData = new FormData();
    formData.append("file", file);
    if (confirmDuplicate) formData.append("confirmDuplicate", "true");
    const res = await fetch("/api/tenders/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (res.status === 402) {
      setErrorAction({ href: "/billing", label: t("upgrade") });
      throw new Error(apiErrorMessage(data, tApiError, t("uploadFailed")));
    }
    if (!res.ok) throw new Error(apiErrorMessage(data, tApiError, t("uploadFailed")));

    if (data.duplicate) {
      const proceed = window.confirm(
        t("duplicateConfirm", {
          fileName: file.name,
          date: new Date(data.existingUploadedAt).toLocaleDateString(),
          title: data.existingTitle || t("duplicateUntitled"),
        })
      );
      if (!proceed) {
        setUploading(false);
        return;
      }
      await upload(file, true);
      return;
    }

    router.push(`/my-tenders/${data.id}`);
    router.refresh();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    setErrorAction(null);
    try {
      await upload(file, false);
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
      {error && (
        <p className="text-sm text-stamp mt-2">
          {error}
          {errorAction && (
            <>
              {" "}
              <Link href={errorAction.href} className="underline hover:text-ink transition-colors">
                {errorAction.label}
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
