import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inter } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import SupportChatWidget from "@/components/SupportChatWidget";
import BetaFeedbackModal from "@/components/betaFeedback/BetaFeedbackModal";
import { routing } from "@/i18n/routing";
import "../globals.css";

// One typeface for everything (headings, body, labels) — matches the clean,
// single-font look of the sites this design is modeled on, as opposed to
// the previous serif/sans/mono mix.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

/** Prerender the shell for every supported locale. Without this, the
 * `[locale]` segment has no known values at build time and every route below
 * it falls back to on-demand rendering. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // generateMetadata runs outside the component render, so it can't rely on
  // the setRequestLocale() call below — pass the locale explicitly or
  // next-intl falls back to reading the locale header, which would opt the
  // route back into dynamic rendering.
  const t = await getTranslations({ locale, namespace: "Metadata.default" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // `[locale]` is effectively a catch-all for unknown first segments, so an
  // unsupported value here is a genuine 404 rather than something to coerce
  // to the default locale.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Makes the locale available to next-intl's server APIs without reading the
  // request headers — this is what keeps statically renderable routes static.
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} className={inter.variable}>
      <body className="font-body min-h-screen">
        <NextIntlClientProvider messages={messages}>
          {children}
          <SupportChatWidget />
          <BetaFeedbackModal />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
