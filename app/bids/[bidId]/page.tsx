import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import BidStatusSelect from "@/components/bids/BidStatusSelect";
import { createClient } from "@/lib/supabase/server";
import { REQUIREMENT_CATEGORIES } from "@/lib/ai/types";
import { computeProgress } from "@/lib/bids";

export const dynamic = "force-dynamic";

function formatDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function categoryLabel(category: string) {
  return category.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const STATUS_DOT: Record<string, string> = {
  NOT_STARTED: "bg-line",
  IN_PROGRESS: "bg-gold",
  COMPLETE: "bg-moss",
  BLOCKED: "bg-stamp",
  NOT_APPLICABLE: "bg-inkDim",
};

export default async function BidWorkspacePage({
  params,
}: {
  params: Promise<{ bidId: string }>;
}) {
  const { bidId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bids/${bidId}`);

  const { data: bid } = await supabase
    .from("bids")
    .select("id, status, tender_id")
    .eq("id", bidId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!bid) notFound();

  const [{ data: tender }, { data: requirements }, { data: openWarnings }] = await Promise.all([
    supabase
      .from("tenders")
      .select("title, contracting_authority, submission_deadline, estimated_value, currency")
      .eq("id", bid.tender_id)
      .maybeSingle(),
    supabase
      .from("bid_requirements")
      .select("id, title, category, mandatory, status")
      .eq("bid_id", bidId),
    supabase
      .from("bid_warnings")
      .select("id, message, type")
      .eq("bid_id", bidId)
      .eq("status", "OPEN"),
  ]);

  const allRequirements = requirements ?? [];
  const overallProgress = computeProgress(allRequirements);

  const categoryGroups = REQUIREMENT_CATEGORIES.map((cat) => ({
    category: cat,
    items: allRequirements.filter((r) => r.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/bids" className="text-sm text-inkDim hover:text-ink">
          ← Back to bids
        </Link>

        <div className="mt-6 mb-8 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-inkDim">
              {tender?.contracting_authority ?? "—"} · Deadline{" "}
              {formatDate(tender?.submission_deadline ?? null)}
            </p>
            <h1 className="font-display font-bold text-3xl text-ink mt-1 leading-tight tracking-tight">
              {tender?.title || "Untitled tender"}
            </h1>
          </div>
          <BidStatusSelect bidId={bid.id} status={bid.status} />
        </div>

        {openWarnings && openWarnings.length > 0 && (
          <div className="border border-gold/30 bg-gold/5 rounded-doc p-4 text-sm text-ink mb-8">
            <p className="font-medium text-gold mb-1">
              {openWarnings.length} open warning{openWarnings.length === 1 ? "" : "s"}
            </p>
            <ul className="space-y-1">
              {openWarnings.slice(0, 5).map((w) => (
                <li key={w.id} className="text-inkDim">
                  ⚠ {w.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-8">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-ink">Overall progress</p>
            <p className="text-sm text-inkDim">{overallProgress}%</p>
          </div>
          <div className="h-2 bg-paperDim rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full" style={{ width: `${overallProgress}%` }} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {categoryGroups.map((group) => {
            const progress = computeProgress(group.items);
            return (
              <div key={group.category}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-inkDim">
                    {categoryLabel(group.category)}
                  </p>
                  <p className="text-xs text-inkDim">{progress}%</p>
                </div>
                <div className="h-1.5 bg-paperDim rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${progress}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <h2 className="font-display font-semibold text-lg text-ink mb-3">Requirements</h2>
        <div className="space-y-5">
          {categoryGroups.map((group) => (
            <div key={group.category}>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                {categoryLabel(group.category)} · {group.items.length}
              </p>
              <ul className="space-y-2">
                {group.items.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/bids/${bidId}/requirements/${r.id}`}
                      className="flex items-center justify-between gap-3 border border-line rounded-doc p-3 text-sm hover:bg-paperDim transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[r.status] ?? STATUS_DOT.NOT_STARTED}`}
                        />
                        <span className="font-medium text-ink">{r.title}</span>
                        {r.mandatory && (
                          <span className="text-[10px] font-semibold uppercase text-stamp">
                            Mandatory
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-inkDim">{r.status.replace(/_/g, " ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
