import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import LandingPage from "@/components/landing/LandingPage";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata.home" });
  return { title: t("title"), description: t("description") };
}

export default async function Home() {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect({ href: "/opportunities", locale });
  }

  return <LandingPage />;
}
