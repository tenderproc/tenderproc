import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { bidStatusLabel, computeProgress } from "@/lib/bids";
import { INTL_LOCALE, type Locale } from "@/lib/locales";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface BidRow {
  id: string;
  status: string;
  tenders: {
    title: string | null;
    submission_deadline: string | null;
    ai_match_score: number | null;
    ai_match_label: string | null;
  } | null;
}

function matchBand(score: number): "strong" | "good" | "moderate" | "weak" {
  if (score >= 85) return "strong";
  if (score >= 65) return "good";
  if (score >= 40) return "moderate";
  return "weak";
}

export default async function BidsPage() {
  const t = await getTranslations("BidsList");
  const tBidStatus = await getTranslations("Enums.bidStatus");
  const tMatchLabel = await getTranslations("Enums.matchLabel");
  const locale = await getLocale();

  function formatDate(d: string | null) {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString(INTL_LOCALE[locale as Locale], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bids");

  const { data: bids } = await supabase
    .from("bids")
    .select(
      "id, status, tenders ( title, submission_deadline, ai_match_score, ai_match_label )"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<BidRow[]>();

  const bidIds = (bids ?? []).map((b) => b.id);
  const progressByBid: Record<string, number> = {};
  if (bidIds.length > 0) {
    const { data: requirements } = await supabase
      .from("bid_requirements")
      .select("bid_id, status")
      .in("bid_id", bidIds);
    for (const bidId of bidIds) {
      progressByBid[bidId] = computeProgress(
        (requirements ?? []).filter((r) => r.bid_id === bidId)
      );
    }
  }

  return (
    <div>
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
            {t("eyebrow")}
          </p>
          <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">{t("description")}</p>
        </div>

        {(!bids || bids.length === 0) && (
          <div className="border border-line rounded-2xl p-8 text-center">
            <p className="text-inkDim">
              {t("emptyBefore")}{" "}
              <Link href="/my-tenders" className="underline text-accent">
                {t("tenders")}
              </Link>{" "}
              {t("emptyAfter")}
            </p>
          </div>
        )}

        <div>
          {(bids ?? []).map((bid) => (
            <Link
              key={bid.id}
              href={`/bids/${bid.id}`}
              className="block border-b border-line py-5 hover:bg-paperDim transition-colors -mx-4 px-4 rounded-doc"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-inkDim mb-1">
                    {bidStatusLabel(bid.status, tBidStatus)}
                  </p>
                  <h3 className="font-display font-semibold text-lg text-ink leading-snug">
                    {bid.tenders?.title || t("untitledTender")}
                  </h3>
                  {bid.tenders?.ai_match_score !== null && bid.tenders?.ai_match_score !== undefined && (
                    <p className="text-sm text-inkDim mt-1">
                      {bid.tenders.ai_match_score}/100 — {tMatchLabel(matchBand(bid.tenders.ai_match_score))}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 w-40">
                  <p className="text-xs text-inkDim uppercase tracking-wide">{t("deadline")}</p>
                  <p className="text-sm text-ink font-medium mb-2">
                    {formatDate(bid.tenders?.submission_deadline ?? null)}
                  </p>
                  <div className="h-1.5 bg-paperDim rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${progressByBid[bid.id] ?? 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-inkDim mt-1">{progressByBid[bid.id] ?? 0}%</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
