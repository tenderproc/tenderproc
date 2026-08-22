"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { normalizeCompanyName } from "@/lib/companies/normalize";

export default function FollowCompanyButton({ companyName }: { companyName: string }) {
  const t = useTranslations("FollowCompanyButton");
  const [state, setState] = useState<"idle" | "saving" | "following" | "error">("idle");

  async function follow(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const normalized = normalizeCompanyName(companyName);
    if (!normalized) return;
    setState("saving");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState("error");
      return;
    }
    // ignoreDuplicates so re-clicking a company already followed is a no-op
    // (same pattern as components/AddToWorkflowButton.tsx).
    const { error } = await supabase.from("followed_companies").upsert(
      {
        user_id: user.id,
        followed_company_name: normalized,
        followed_company_display_name: companyName.trim(),
      },
      { onConflict: "user_id,followed_company_name", ignoreDuplicates: true }
    );
    setState(error ? "error" : "following");
  }

  if (state === "following") {
    return <span className="text-xs font-medium text-moss">{t("following")}</span>;
  }

  return (
    <button
      onClick={follow}
      disabled={state === "saving"}
      className="text-xs font-medium text-accent border border-accent/30 bg-accent/5 rounded-full px-3 py-1 hover:bg-accent/10 transition-colors disabled:opacity-50"
    >
      {state === "saving" ? t("saving") : state === "error" ? t("tryAgain") : t("follow")}
    </button>
  );
}
