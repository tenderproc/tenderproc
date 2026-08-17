import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BillingSuccessPage() {
  const t = await getTranslations("BillingSuccessPage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/billing/success");

  return (
    <div>
      <Header />
      <main className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">{t("eyebrow")}</p>
        <h1 className="font-display font-bold text-3xl text-ink tracking-tight mt-2">{t("heading")}</h1>
        <p className="text-sm text-inkDim mt-3 max-w-md mx-auto leading-relaxed">{t("body")}</p>
        <Link
          href="/billing"
          className="inline-block mt-8 text-sm font-medium text-white bg-accent rounded-doc px-5 py-2.5 hover:bg-accentDim transition-colors"
        >
          {t("cta")}
        </Link>
      </main>
    </div>
  );
}
