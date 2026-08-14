"use client";

import { useState } from "react";
import { EligibilityResult, TenderNotice } from "@/lib/types";
import StampBadge from "./StampBadge";

export default function UploadAnalyzer({ tender }: { tender: TenderNotice }) {
  const [pastedText, setPastedText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EligibilityResult | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    // Beta keeps this simple: extract text client-side isn't reliable for
    // PDFs, so for now we just note the filename and let the pasted-text
    // box carry the content. Swap in a proper upload + server-side
    // pdf-parse pass once you're past the beta.
  }

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tender, documentText: pastedText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-line rounded-2xl p-6 bg-white">
      <h2 className="font-display font-semibold text-xl text-ink mb-1">Check eligibility</h2>
      <p className="text-sm text-inkDim mb-4">
        Paste the tender&apos;s requirements or ESPD text below — or just run the
        check on the notice metadata alone.
      </p>

      <textarea
        value={pastedText}
        onChange={(e) => setPastedText(e.target.value)}
        rows={6}
        placeholder="Paste the tender document text here (optional)…"
        className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent mb-3"
      />

      <div className="flex items-center justify-between mb-4">
        <label className="text-xs text-inkDim cursor-pointer underline">
          or attach a file for reference (not parsed yet in beta)
          <input type="file" accept=".pdf" className="hidden" onChange={onFileChange} />
        </label>
        {fileName && <span className="text-xs text-inkDim">{fileName}</span>}
      </div>

      <button
        onClick={runAnalysis}
        disabled={loading}
        className="bg-accent text-white px-5 py-2.5 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors disabled:opacity-50"
      >
        {loading ? "Reading the tender…" : "Run eligibility check"}
      </button>

      {error && <p className="text-sm text-stamp mt-4">{error}</p>}

      {result && (
        <div className="mt-8 flex gap-6 items-start flex-wrap">
          <StampBadge verdict={result.verdict} />
          <div className="flex-1 min-w-[240px]">
            <p className="text-ink leading-relaxed mb-4">{result.summary}</p>
            {result.keyRequirements?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                  Key requirements
                </p>
                <ul className="space-y-1.5">
                  {result.keyRequirements.map((r, i) => (
                    <li key={i} className="text-sm text-ink flex gap-2">
                      <span className="text-gold">—</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.deadlineFlag && (
              <p className="text-sm text-stamp mb-3">⚠ {result.deadlineFlag}</p>
            )}
            <p className="text-xs text-inkDim">{result.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
