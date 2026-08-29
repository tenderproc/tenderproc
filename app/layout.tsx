import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import SupportChatWidget from "@/components/SupportChatWidget";
import BetaFeedbackModal from "@/components/betaFeedback/BetaFeedbackModal";
import "./globals.css";

// One typeface for everything (headings, body, labels) — matches the clean,
// single-font look of the sites this design is modeled on, as opposed to
// the previous serif/sans/mono mix.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "TenderProc — Beta",
  description: "AI-assisted public tender screening for Belgian SMEs.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
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
