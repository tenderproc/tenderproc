import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import UploadTenderButton from "@/components/tenders/UploadTenderButton";
import TenderStatusBadge from "@/components/tenders/TenderStatusBadge";
import { MatchScorePill } from "@/components/tenders/BidMatchBadge";
import { createClient } from "@/lib/supabase/server";
import { INTL_LOCALE, type Locale } from "@/lib/locales";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MyTendersPage() {
  const t = await getTranslations("MyTendersList");
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

  function formatValue(value: number | null, currency: string | null) {
    if (value === null) return "—";
    return `${currency ?? "EUR"} ${new Intl.NumberFormat(INTL_LOCALE[locale]).format(value)}`;
  }

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
              {t("eyebrow")}
            </p>
            <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
              {t("heading")}
            </h1>
            <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">
              {t("description")}
            </p>
          </div>
          <UploadTenderButton />
        </div>

        {(!tenders || tenders.length === 0) && (
          <div className="border border-line rounded-2xl p-8 text-center">
            <p className="text-inkDim">{t("empty")}</p>
          </div>
        )}

        <div>
          {(tenders ?? []).map((tender) => (
            <Link
              key={tender.id}
              href={`/my-tenders/${tender.id}`}
              className="block border-b border-line py-5 hover:bg-paperDim transition-colors -mx-4 px-4 rounded-doc"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <TenderStatusBadge status={tender.status} />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-ink leading-snug">
                    {tender.title || t("analyzing")}
                  </h3>
                  <p className="text-sm text-inkDim mt-1">
                    {tender.contracting_authority || "—"}
                  </p>
                  {tender.ai_match_score !== null && (
                    <div className="mt-2">
                      <MatchScorePill score={tender.ai_match_score} />
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-inkDim uppercase tracking-wide">{t("deadline")}</p>
                  <p className="text-sm text-ink font-medium">
                    {formatDate(tender.submission_deadline)}
                  </p>
                  <p className="text-xs text-inkDim uppercase tracking-wide mt-2">{t("value")}</p>
                  <p className="text-sm text-ink font-medium">
                    {formatValue(tender.estimated_value, tender.currency)}
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
