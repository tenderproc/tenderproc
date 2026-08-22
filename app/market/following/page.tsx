import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import MarketSubNav from "@/components/MarketSubNav";
import FollowedCompaniesList from "@/components/FollowedCompaniesList";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FollowingPage() {
  const t = await getTranslations("FollowedCompanies");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/market/following");

  const { data: rows } = await supabase
    .from("followed_companies")
    .select("id, followed_company_display_name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const companies = (rows ?? []).map((r) => ({
    id: r.id as string,
    displayName: r.followed_company_display_name as string,
    createdAt: r.created_at as string,
  }));

  return (
    <div>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-6">
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

        <MarketSubNav active="following" />

        <FollowedCompaniesList companies={companies} />
      </main>
    </div>
  );
}
