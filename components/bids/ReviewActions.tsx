"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RunReviewButton({ bidId, hasReview }: { bidId: string; hasReview: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not run the review.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the review.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={running}
        className="text-sm font-medium text-white bg-accent rounded-doc px-5 py-2.5 hover:bg-accentDim transition-colors disabled:opacity-50"
      >
        {running ? "Running review…" : hasReview ? "Re-run review" : "Run review"}
      </button>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}

export function MarkSubmittedButton({ bidId, status }: { bidId: string; status: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function markSubmitted() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("bids")
      .update({ status: "SUBMITTED", updated_at: new Date().toISOString() })
      .eq("id", bidId);
    setSaving(false);
    router.refresh();
  }

  if (status === "SUBMITTED" || status === "WON" || status === "LOST" || status === "WITHDRAWN" || status === "NO_RESULT") {
    return (
      <span className="text-sm font-medium text-moss border border-moss/30 bg-moss/5 rounded-doc px-4 py-2">
        ✓ {status === "SUBMITTED" ? "Submitted" : "Bid closed"}
      </span>
    );
  }

  return (
    <button
      onClick={markSubmitted}
      disabled={saving}
      className="text-sm font-medium text-ink border border-line rounded-doc px-4 py-2 hover:bg-paperDim transition-colors disabled:opacity-50"
    >
      {saving ? "Saving…" : "Mark as Submitted"}
    </button>
  );
}

export function DownloadDocumentLink({ storagePath, label }: { storagePath: string; label: string }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.storage.from("bid-documents").createSignedUrl(storagePath, 60);
    setLoading(false);
    if (data) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <button onClick={download} disabled={loading} className="text-sm text-accent hover:underline">
      {loading ? "Opening…" : label}
    </button>
  );
}
