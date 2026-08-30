"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiErrorMessage } from "@/lib/apiErrors";

export default function FailedTenderActions({ tenderId }: { tenderId: string }) {
  const t = useTranslations("TenderDetail");
  const tApiError = useTranslations("Errors.api");
  const router = useRouter();
  const [busy, setBusy] = useState<"retry" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy("retry");
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(apiErrorMessage(data, tApiError, t("retryFailed")));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("retryFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function deleteTender() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(data, tApiError, t("deleteFailed")));
      router.push("/my-tenders");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deleteFailed"));
      setBusy(null);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={retry}
          disabled={busy !== null}
          className="text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors disabled:opacity-50"
        >
          {busy === "retry" ? t("retrying") : t("retryAnalysis")}
        </button>
        <button
          onClick={deleteTender}
          disabled={busy !== null}
          className="text-sm font-medium text-stamp border border-stamp/30 bg-stamp/5 rounded-doc px-4 py-2 hover:bg-stamp/10 transition-colors disabled:opacity-50"
        >
          {busy === "delete" ? t("deleting") : t("deleteTender")}
        </button>
      </div>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
