import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Passing the locale explicitly (rather than letting next-intl read it back
  // off the request headers) is what keeps this route statically renderable.
  const t = await getTranslations({ locale, namespace: "Metadata.login" });
  return { title: t("title"), description: t("description") };
}

export default async function LoginLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return children;
}
