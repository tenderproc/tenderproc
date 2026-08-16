import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TenderProc — AI-assisted public tender discovery for Belgian SMEs",
  description: "AI-assisted public tender screening for Belgian SMEs.",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/opportunities");
  }

  return <LandingPage />;
}
