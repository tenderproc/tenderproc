import Link from "next/link";
import Header from "@/components/Header";
import UploadTenderButton from "@/components/tenders/UploadTenderButton";
import TenderStatusBadge from "@/components/tenders/TenderStatusBadge";
import { MatchScorePill } from "@/components/tenders/BidMatchBadge";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function formatDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatValue(value: number | null, currency: string | null) {
  if (value === null) return "—";
  return `${currency ?? "EUR"} ${new Intl.NumberFormat("en-BE").format(value)}`;
}

export default async function MyTendersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/my-tenders");

  const { data: tenders } = await supabase
    .from("tenders")
    .select(
      "id, title, contracting_authority, estimated_value, currency, submission_deadline, status, ai_match_score, ai_match_label"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
              Uploaded tenders · AI analysis
            </p>
            <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
              Tenders
            </h1>
            <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">
              Upload a tender PDF to get a structured breakdown: award
              criteria, requirements, and a Bid/No-Bid recommendation
              grounded in your company profile.
            </p>
          </div>
          <UploadTenderButton />
        </div>

        {(!tenders || tenders.length === 0) && (
          <div className="border border-line rounded-2xl p-8 text-center">
            <p className="text-inkDim">
              No tenders uploaded yet. Upload a PDF to get started.
            </p>
          </div>
        )}

        <div>
          {(tenders ?? []).map((t) => (
            <Link
              key={t.id}
              href={`/my-tenders/${t.id}`}
              className="block border-b border-line py-5 hover:bg-paperDim transition-colors -mx-4 px-4 rounded-doc"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <TenderStatusBadge status={t.status} />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-ink leading-snug">
                    {t.title || "Analyzing…"}
                  </h3>
                  <p className="text-sm text-inkDim mt-1">
                    {t.contracting_authority || "—"}
                  </p>
                  {t.ai_match_score !== null && (
                    <div className="mt-2">
                      <MatchScorePill score={t.ai_match_score} matchLabel={t.ai_match_label} />
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-inkDim uppercase tracking-wide">Deadline</p>
                  <p className="text-sm text-ink font-medium">
                    {formatDate(t.submission_deadline)}
                  </p>
                  <p className="text-xs text-inkDim uppercase tracking-wide mt-2">Value</p>
                  <p className="text-sm text-ink font-medium">
                    {formatValue(t.estimated_value, t.currency)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
