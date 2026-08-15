"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiErrorMessage } from "@/lib/apiErrors";

export default function MapEvidenceButton({
  tenderId,
  hasMapping,
}: {
  tenderId: string;
  hasMapping: boolean;
}) {
  const t = useTranslations("MapEvidenceButton");
  const tApiError = useTranslations("Errors.api");
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/map-evidence`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, tApiError, t("couldNotMap")));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotMap"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={running}
        className="text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors disabled:opacity-50"
      >
        {running ? t("mapping") : hasMapping ? t("remap") : t("map")}
      </button>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
