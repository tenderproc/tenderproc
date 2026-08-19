import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up — TenderProc",
  description: "Create your TenderProc account to get tenders matched to your business.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
