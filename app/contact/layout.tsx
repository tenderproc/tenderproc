import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — TenderProc",
  description: "Get in touch with TenderProc, or check our frequently asked questions.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
