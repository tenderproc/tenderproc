import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import BidStatusSelect from "@/components/bids/BidStatusSelect";
import DocumentsChecklist from "@/components/bids/DocumentsChecklist";
import RecordOutcomeForm from "@/components/bids/RecordOutcomeForm";
import { createClient } from "@/lib/supabase/server";
import { REQUIREMENT_CATEGORIES } from "@/lib/ai/types";
import { computeProgress } from "@/lib/bids";
import { requirementCategoryLabel } from "@/lib/requirementCategory";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

export const dynamic = "force-dynamic";

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
  const t = await getTranslations("BidWorkspace");
  const tCategory = await getTranslations("Enums.requirementCategory");
  const tStatus = await getTranslations("Enums.requirementStatus");
  const locale = (await getLocale()) as Locale;

  function formatDate(d: string | null) {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString(INTL_LOCALE[locale], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

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

  const [{ data: tender }, { data: requirements }, { data: openWarnings }, { data: documents }, { data: outcome }] =
    await Promise.all([
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
      supabase
        .from("bid_documents")
        .select("id, name, status, storage_path, file_name, file_size_bytes")
        .eq("bid_id", bidId),
      supabase.from("bid_outcomes").select("*").eq("bid_id", bidId).maybeSingle(),
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
          ← {t("backToBids")}
        </Link>

        <div className="mt-6 mb-8 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-inkDim">
              {t("authorityDeadline", {
                authority: tender?.contracting_authority ?? "—",
                date: formatDate(tender?.submission_deadline ?? null),
              })}
            </p>
            <h1 className="font-display font-bold text-3xl text-ink mt-1 leading-tight tracking-tight">
              {tender?.title || t("untitledTender")}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/bids/${bidId}/review`}
              className="text-sm font-medium text-accent border border-accent/30 bg-accent/5 rounded-doc px-4 py-2 hover:bg-accent/10 transition-colors"
            >
              {t("reviewBid")} →
            </Link>
            <BidStatusSelect bidId={bid.id} status={bid.status} />
          </div>
        </div>

        {openWarnings && openWarnings.length > 0 && (
          <div className="border border-gold/30 bg-gold/5 rounded-doc p-4 text-sm text-ink mb-8">
            <p className="font-medium text-gold mb-1">
              {t("openWarnings", { count: openWarnings.length })}
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
            <p className="text-sm font-medium text-ink">{t("overallProgress")}</p>
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
                    {requirementCategoryLabel(group.category, tCategory)}
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

        <h2 className="font-display font-semibold text-lg text-ink mb-3">{t("requirements")}</h2>
        <div className="space-y-5">
          {categoryGroups.map((group) => (
            <div key={group.category}>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
                {requirementCategoryLabel(group.category, tCategory)} · {group.items.length}
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
                            {t("mandatory")}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-inkDim">{tStatus(r.status)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <DocumentsChecklist bidId={bidId} userId={user.id} initialDocuments={documents ?? []} />
        </div>

        <div className="mt-8">
          <RecordOutcomeForm bidId={bidId} status={bid.status} initialOutcome={outcome ?? null} />
        </div>
      </main>
    </div>
  );
}
