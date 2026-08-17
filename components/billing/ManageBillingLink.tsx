"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiErrorMessage } from "@/lib/apiErrors";

export default function ManageBillingLink() {
  const t = useTranslations("BillingPage");
  const tApiError = useTranslations("Errors.api");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal");
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, tApiError, t("couldNotOpenPortal")));
      window.location.href = data.portalUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotOpenPortal"));
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={openPortal}
        disabled={loading}
        className="text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors disabled:opacity-50"
      >
        {loading ? t("opening") : t("managePlan")}
      </button>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
