"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export default function AddToWorkflowButton({
  publicationNumber,
}: {
  publicationNumber: string;
}) {
  const t = useTranslations("AddToWorkflowButton");
  const [state, setState] = useState<"idle" | "saving" | "added" | "error">("idle");

  async function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setState("saving");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState("error");
      return;
    }
    // ignoreDuplicates so re-clicking a tender already in the pipeline
    // doesn't reset its stage back to "screening".
    const { error } = await supabase.from("pipeline_items").upsert(
      { user_id: user.id, publication_number: publicationNumber, stage: "screening" },
      { onConflict: "user_id,publication_number", ignoreDuplicates: true }
    );
    setState(error ? "error" : "added");
  }

  if (state === "added") {
    return <span className="text-xs font-medium text-moss">{t("added")}</span>;
  }

  return (
    <button
      onClick={add}
      disabled={state === "saving"}
      className="text-xs font-medium text-accent border border-accent/30 bg-accent/5 rounded-full px-3 py-1 hover:bg-accent/10 transition-colors disabled:opacity-50"
    >
      {state === "saving" ? t("adding") : state === "error" ? t("tryAgain") : t("addToWorkflow")}
    </button>
  );
}
