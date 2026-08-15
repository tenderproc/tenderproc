"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { BID_STATUSES } from "@/lib/bids";

export default function BidStatusSelect({ bidId, status }: { bidId: string; status: string }) {
  const t = useTranslations("Enums.bidStatus");
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function onChange(next: string) {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("bids")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", bidId);
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      value={status}
      disabled={saving}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-line rounded-doc px-3 py-2 bg-white disabled:opacity-50"
    >
      {BID_STATUSES.map((s) => (
        <option key={s.key} value={s.key}>
          {t(s.key)}
        </option>
      ))}
    </select>
  );
}
