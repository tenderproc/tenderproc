"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export interface BidOutcomeRow {
  outcome: string;
  contract_value: number | null;
  duration: string | null;
  notes: string | null;
  reason: string | null;
  winning_bidder: string | null;
  winning_price: number | null;
  competitor_score: number | null;
  feedback: string | null;
}

const OUTCOME_KEYS = ["WON", "LOST", "WITHDRAWN", "NO_RESULT"] as const;

function toNumberOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function RecordOutcomeForm({
  bidId,
  status,
  initialOutcome,
}: {
  bidId: string;
  status: string;
  initialOutcome: BidOutcomeRow | null;
}) {
  const t = useTranslations("RecordOutcomeForm");
  const tOutcome = useTranslations("Enums.bidOutcome");
  const tBidStatus = useTranslations("Enums.bidStatus");
  const router = useRouter();
  const [editing, setEditing] = useState(!initialOutcome);
  const [outcome, setOutcome] = useState<string>(initialOutcome?.outcome ?? "WON");
  const [contractValue, setContractValue] = useState(initialOutcome?.contract_value?.toString() ?? "");
  const [duration, setDuration] = useState(initialOutcome?.duration ?? "");
  const [notes, setNotes] = useState(initialOutcome?.notes ?? "");
  const [reason, setReason] = useState(initialOutcome?.reason ?? "");
  const [winningBidder, setWinningBidder] = useState(initialOutcome?.winning_bidder ?? "");
  const [winningPrice, setWinningPrice] = useState(initialOutcome?.winning_price?.toString() ?? "");
  const [competitorScore, setCompetitorScore] = useState(
    initialOutcome?.competitor_score?.toString() ?? ""
  );
  const [feedback, setFeedback] = useState(initialOutcome?.feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const { error: outcomeError } = await supabase.from("bid_outcomes").upsert(
      {
        bid_id: bidId,
        outcome,
        contract_value: outcome === "WON" ? toNumberOrNull(contractValue) : null,
        duration: outcome === "WON" ? duration || null : null,
        notes: notes || null,
        reason: outcome === "LOST" ? reason || null : null,
        winning_bidder: outcome === "LOST" ? winningBidder || null : null,
        winning_price: outcome === "LOST" ? toNumberOrNull(winningPrice) : null,
        competitor_score: outcome === "LOST" ? toNumberOrNull(competitorScore) : null,
        feedback: outcome === "LOST" ? feedback || null : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "bid_id" }
    );
    if (outcomeError) {
      setSaving(false);
      setError(outcomeError.message);
      return;
    }

    await supabase
      .from("bids")
      .update({ status: outcome, updated_at: new Date().toISOString() })
      .eq("id", bidId);

    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (!editing && initialOutcome) {
    return (
      <div className="border border-line bg-white rounded-2xl p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-semibold text-lg text-ink">{t("outcome")}</h2>
          <button onClick={() => setEditing(true)} className="text-sm text-accent hover:underline">
            {t("edit")}
          </button>
        </div>
        <p className="text-sm text-ink font-medium">{tOutcome(initialOutcome.outcome)}</p>
        {initialOutcome.outcome === "WON" && (
          <p className="text-sm text-inkDim mt-1">
            {initialOutcome.contract_value ? `€${initialOutcome.contract_value.toLocaleString()}` : ""}
            {initialOutcome.duration ? ` · ${initialOutcome.duration}` : ""}
          </p>
        )}
        {initialOutcome.outcome === "LOST" && (
          <p className="text-sm text-inkDim mt-1">
            {initialOutcome.reason}
            {initialOutcome.winning_bidder
              ? ` · ${t("wonBy", { bidder: initialOutcome.winning_bidder })}`
              : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-line bg-white rounded-2xl p-6">
      <h2 className="font-display font-semibold text-lg text-ink mb-1">{t("recordOutcome")}</h2>
      <p className="text-xs text-inkDim mb-4">
        {t("storedHint", { status: tBidStatus(status) })}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {OUTCOME_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setOutcome(key)}
            className={`text-sm font-medium rounded-doc px-4 py-2 border transition-colors ${
              outcome === key
                ? "bg-accent text-white border-accent"
                : "text-ink border-line hover:bg-paperDim"
            }`}
          >
            {tOutcome(key)}
          </button>
        ))}
      </div>

      {outcome === "WON" && (
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input
            value={contractValue}
            onChange={(e) => setContractValue(e.target.value)}
            placeholder={t("contractValuePlaceholder")}
            type="number"
            className="border border-line rounded-doc px-3 py-2 text-sm"
          />
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={t("durationPlaceholder")}
            className="border border-line rounded-doc px-3 py-2 text-sm"
          />
        </div>
      )}

      {outcome === "LOST" && (
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            className="border border-line rounded-doc px-3 py-2 text-sm"
          />
          <input
            value={winningBidder}
            onChange={(e) => setWinningBidder(e.target.value)}
            placeholder={t("winningBidderPlaceholder")}
            className="border border-line rounded-doc px-3 py-2 text-sm"
          />
          <input
            value={winningPrice}
            onChange={(e) => setWinningPrice(e.target.value)}
            placeholder={t("winningPricePlaceholder")}
            type="number"
            className="border border-line rounded-doc px-3 py-2 text-sm"
          />
          <input
            value={competitorScore}
            onChange={(e) => setCompetitorScore(e.target.value)}
            placeholder={t("ourScorePlaceholder")}
            type="number"
            className="border border-line rounded-doc px-3 py-2 text-sm"
          />
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={t("feedbackPlaceholder")}
            rows={2}
            className="border border-line rounded-doc px-3 py-2 text-sm sm:col-span-2"
          />
        </div>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("notesPlaceholder")}
        rows={2}
        className="w-full border border-line rounded-doc px-3 py-2 text-sm mb-3"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="text-sm font-medium text-white bg-moss rounded-doc px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? t("saving") : t("saveOutcome")}
        </button>
        {initialOutcome && (
          <button
            onClick={() => setEditing(false)}
            className="text-sm text-inkDim hover:text-ink"
          >
            {t("cancel")}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-stamp mt-2">{error}</p>}
    </div>
  );
}
