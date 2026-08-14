"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ACTIVE_STAGES, ALL_STAGES, TERMINAL_STAGES } from "@/lib/workflow";
import { TenderNotice } from "@/lib/types";

interface Card {
  pipelineId: string;
  stage: string;
  tender: TenderNotice | null;
}

export default function WorkflowBoard({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function setStage(pipelineId: string, stage: string) {
    setPendingId(pipelineId);
    const supabase = createClient();
    await supabase
      .from("pipeline_items")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", pipelineId);
    setPendingId(null);
    router.refresh();
  }

  async function remove(pipelineId: string) {
    setPendingId(pipelineId);
    const supabase = createClient();
    await supabase.from("pipeline_items").delete().eq("id", pipelineId);
    setPendingId(null);
    router.refresh();
  }

  if (cards.length === 0) {
    return (
      <div className="border border-line rounded-2xl p-8 text-center">
        <p className="text-inkDim">
          Nothing in your workflow yet. Add a tender from{" "}
          <Link href="/opportunities" className="underline text-accent">
            Opportunities
          </Link>{" "}
          to start tracking it here.
        </p>
      </div>
    );
  }

  const closedStages = TERMINAL_STAGES.filter((stage) =>
    cards.some((c) => c.stage === stage.key)
  );

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ACTIVE_STAGES.map((stage) => {
          const stageCards = cards.filter((c) => c.stage === stage.key);
          return (
            <div key={stage.key} className="border border-line rounded-2xl bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">
                {stage.label} · {stageCards.length}
              </p>
              <div className="space-y-3">
                {stageCards.map((card) => (
                  <PipelineCard
                    key={card.pipelineId}
                    card={card}
                    disabled={pendingId === card.pipelineId}
                    onStageChange={(s) => setStage(card.pipelineId, s)}
                    onRemove={() => remove(card.pipelineId)}
                  />
                ))}
                {stageCards.length === 0 && (
                  <p className="text-xs text-inkDim">Nothing here.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {closedStages.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">
            Closed
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {closedStages.map((stage) => {
              const stageCards = cards.filter((c) => c.stage === stage.key);
              return (
                <div key={stage.key} className="border border-line rounded-2xl bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-3">
                    {stage.label} · {stageCards.length}
                  </p>
                  <div className="space-y-3">
                    {stageCards.map((card) => (
                      <PipelineCard
                        key={card.pipelineId}
                        card={card}
                        disabled={pendingId === card.pipelineId}
                        onStageChange={(s) => setStage(card.pipelineId, s)}
                        onRemove={() => remove(card.pipelineId)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineCard({
  card,
  disabled,
  onStageChange,
  onRemove,
}: {
  card: Card;
  disabled: boolean;
  onStageChange: (stage: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-line rounded-doc p-3">
      {card.tender ? (
        <Link
          href={`/tenders/${encodeURIComponent(card.tender.publicationNumber)}`}
          className="text-sm font-medium text-ink hover:text-accent leading-snug block"
        >
          {card.tender.title}
        </Link>
      ) : (
        <p className="text-sm text-inkDim italic">
          Couldn&apos;t load this tender&apos;s details.
        </p>
      )}
      {card.tender && (
        <p className="text-xs text-inkDim mt-1">{card.tender.buyerName}</p>
      )}
      <div className="flex items-center gap-2 mt-3">
        <select
          value={card.stage}
          disabled={disabled}
          onChange={(e) => onStageChange(e.target.value)}
          className="text-xs border border-line rounded-doc px-2 py-1 bg-white flex-1"
        >
          {ALL_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={onRemove}
          disabled={disabled}
          className="text-xs text-stamp hover:underline disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
