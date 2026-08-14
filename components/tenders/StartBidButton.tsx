"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartBidButton({ tenderId }: { tenderId: string }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the bid.");
      router.push(`/bids/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the bid.");
      setStarting(false);
    }
  }

  return (
    <div>
      <button
        onClick={start}
        disabled={starting}
        className="bg-accent text-white px-5 py-2.5 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors disabled:opacity-50"
      >
        {starting ? "Starting…" : "Start Bid"}
      </button>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
