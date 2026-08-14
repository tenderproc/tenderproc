"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface EvidenceMatch {
  type: "service" | "certification" | "reference";
  id: string;
  label: string;
  relevance: "High" | "Medium" | "Low";
  reason: string;
}

interface UsedEvidence {
  type: string;
  id: string;
  label: string;
}

const REQUIREMENT_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "BLOCKED", "NOT_APPLICABLE"];

function evidenceKey(type: string, id: string) {
  return `${type}:${id}`;
}

export default function RequirementWorkspace({
  bidId,
  requirementId,
  requirementStatus,
  initialResponse,
  initialEvidence,
  initialWarnings,
}: {
  bidId: string;
  requirementId: string;
  requirementStatus: string;
  initialResponse: { id: string; draftText: string; confidence: string | null; accepted: boolean } | null;
  initialEvidence: UsedEvidence[];
  initialWarnings: { id: string; message: string }[];
}) {
  const router = useRouter();

  const [status, setStatus] = useState(requirementStatus);
  const [evidenceMatches, setEvidenceMatches] = useState<EvidenceMatch[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialEvidence.map((e) => evidenceKey(e.type, e.id)))
  );
  const [usedEvidence, setUsedEvidence] = useState<UsedEvidence[]>(initialEvidence);

  const [draftText, setDraftText] = useState(initialResponse?.draftText ?? "");
  const [confidence, setConfidence] = useState(initialResponse?.confidence ?? null);
  const [accepted, setAccepted] = useState(initialResponse?.accepted ?? false);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [unsupportedClaims, setUnsupportedClaims] = useState<{ id: string; message: string }[]>(
    initialWarnings
  );
  const [editing, setEditing] = useState(false);

  const [findingEvidence, setFindingEvidence] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findEvidence() {
    setFindingEvidence(true);
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/requirements/${requirementId}/find-evidence`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not find evidence.");
      setEvidenceMatches(data.matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find evidence.");
    } finally {
      setFindingEvidence(false);
    }
  }

  function toggleEvidence(type: string, id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = evidenceKey(type, id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function generateDraft() {
    setGenerating(true);
    setError(null);
    try {
      const evidence = Array.from(selected).map((key) => {
        const [type, id] = key.split(":");
        return { type, id };
      });
      const res = await fetch(`/api/bids/${bidId}/requirements/${requirementId}/generate-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate a draft.");
      setDraftText(data.draft);
      setConfidence(data.confidence);
      setDraftWarnings(data.warnings ?? []);
      setUnsupportedClaims(
        (data.unsupportedClaims ?? []).map((m: string, i: number) => ({ id: `new-${i}`, message: m }))
      );
      setUsedEvidence(data.evidence ?? []);
      setAccepted(false);
      setEditing(false);
      if (status === "NOT_STARTED") setStatus("IN_PROGRESS");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a draft.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveAndRecheck() {
    setRechecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/bids/${bidId}/requirements/${requirementId}/recheck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not re-check the draft.");
      setUnsupportedClaims(
        (data.unsupportedClaims ?? []).map((m: string, i: number) => ({ id: `recheck-${i}`, message: m }))
      );
      setAccepted(false);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not re-check the draft.");
    } finally {
      setRechecking(false);
    }
  }

  async function accept() {
    if (!initialResponse && !draftText) return;
    const supabase = createClient();
    const { data: responseRow } = await supabase
      .from("bid_responses")
      .select("id")
      .eq("bid_requirement_id", requirementId)
      .maybeSingle();
    if (responseRow) {
      await supabase.from("bid_responses").update({ accepted: true }).eq("id", responseRow.id);
    }
    await supabase
      .from("bid_requirements")
      .update({ status: "COMPLETE", updated_at: new Date().toISOString() })
      .eq("id", requirementId);
    setAccepted(true);
    setStatus("COMPLETE");
    router.refresh();
  }

  async function dismissWarning(warningId: string) {
    if (!warningId.startsWith("new-") && !warningId.startsWith("recheck-")) {
      const supabase = createClient();
      await supabase
        .from("bid_warnings")
        .update({ status: "DISMISSED", resolved_at: new Date().toISOString() })
        .eq("id", warningId);
    }
    setUnsupportedClaims((prev) => prev.filter((w) => w.id !== warningId));
  }

  async function markStatus(next: string) {
    setStatus(next);
    const supabase = createClient();
    await supabase
      .from("bid_requirements")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", requirementId);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium uppercase tracking-wide text-inkDim">Status</label>
        <select
          value={status}
          onChange={(e) => markStatus(e.target.value)}
          className="text-sm border border-line rounded-doc px-2 py-1 bg-white"
        >
          {REQUIREMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="border border-line bg-white rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-lg text-ink">Relevant evidence found</h2>
          <button
            onClick={findEvidence}
            disabled={findingEvidence}
            className="text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors disabled:opacity-50"
          >
            {findingEvidence ? "Finding evidence…" : "Find Evidence"}
          </button>
        </div>

        {evidenceMatches === null && usedEvidence.length === 0 && (
          <p className="text-sm text-inkDim">
            Click Find Evidence to see which of your company&apos;s services, certifications, and
            references are relevant to this requirement.
          </p>
        )}

        {evidenceMatches !== null && evidenceMatches.length === 0 && (
          <p className="text-sm text-inkDim">No relevant company evidence found for this requirement.</p>
        )}

        {evidenceMatches !== null && evidenceMatches.length > 0 && (
          <ul className="space-y-2 mb-2">
            {evidenceMatches.map((m) => {
              const key = evidenceKey(m.type, m.id);
              return (
                <li key={key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 accent-accent"
                    checked={selected.has(key)}
                    onChange={() => toggleEvidence(m.type, m.id)}
                  />
                  <div>
                    <p className="text-ink font-medium">
                      {m.label}{" "}
                      <span className="text-xs text-inkDim font-normal">
                        ({m.type} · {m.relevance} similarity)
                      </span>
                    </p>
                    <p className="text-inkDim text-xs">{m.reason}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {usedEvidence.length > 0 && (
          <div className="mt-3 pt-3 border-t border-line">
            <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-1">
              Evidence used in current draft
            </p>
            <ul className="space-y-1">
              {usedEvidence.map((e) => (
                <li key={evidenceKey(e.type, e.id)} className="text-sm text-ink flex gap-2">
                  <span className="text-moss">✓</span>
                  {e.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={generateDraft}
          disabled={generating}
          className="mt-4 bg-accent text-white px-5 py-2.5 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors disabled:opacity-50"
        >
          {generating ? "Generating…" : draftText ? "Regenerate Draft" : "Generate Draft"}
        </button>
        {error && <p className="text-sm text-stamp mt-2">{error}</p>}
      </div>

      {draftText && (
        <div className="border border-line bg-white rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-lg text-ink">AI Draft</h2>
            <div className="flex items-center gap-2">
              {confidence && (
                <span className="text-xs font-medium text-inkDim">Confidence: {confidence}</span>
              )}
              {accepted && <span className="text-xs font-medium text-moss">Accepted ✓</span>}
            </div>
          </div>

          {editing ? (
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={8}
              className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
          ) : (
            <p className="text-ink leading-relaxed whitespace-pre-wrap text-sm">{draftText}</p>
          )}

          {draftWarnings.length > 0 && (
            <div className="mt-3 text-sm text-gold space-y-1">
              {draftWarnings.map((w, i) => (
                <p key={i}>⚠ {w}</p>
              ))}
            </div>
          )}

          {unsupportedClaims.length > 0 && (
            <div className="mt-4 border border-stamp/30 bg-stamp/5 rounded-doc p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stamp mb-2">
                Unsupported claim{unsupportedClaims.length === 1 ? "" : "s"}
              </p>
              <ul className="space-y-2">
                {unsupportedClaims.map((w) => (
                  <li key={w.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-ink italic">&ldquo;{w.message}&rdquo;</span>
                    <button
                      onClick={() => dismissWarning(w.id)}
                      className="text-xs text-inkDim hover:text-ink shrink-0"
                    >
                      Dismiss
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-inkDim mt-2">
                This could not be verified against your company knowledge base. Edit the draft to
                remove or rephrase it, or add supporting evidence above and regenerate.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-4">
            {!accepted && (
              <button
                onClick={accept}
                className="text-sm font-medium text-white bg-moss rounded-doc px-4 py-2 hover:opacity-90 transition-opacity"
              >
                Accept Draft
              </button>
            )}
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="text-sm font-medium text-ink border border-line rounded-doc px-4 py-2 hover:bg-paperDim transition-colors"
              >
                Edit
              </button>
            ) : (
              <button
                onClick={saveAndRecheck}
                disabled={rechecking}
                className="text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors disabled:opacity-50"
              >
                {rechecking ? "Re-checking…" : "Save & Re-check"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
