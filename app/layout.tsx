import type { Metadata } from "next";
import { Inter } from "next/font/google";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-body min-h-screen">{children}</body>
    </html>
  );
}
