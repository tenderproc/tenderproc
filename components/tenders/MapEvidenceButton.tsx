"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MapEvidenceButton({
  tenderId,
  hasMapping,
}: {
  tenderId: string;
  hasMapping: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/map-evidence`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not map evidence.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not map evidence.");
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
        {running ? "Mapping evidence…" : hasMapping ? "Re-map Evidence" : "Map Evidence to Requirements"}
      </button>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
