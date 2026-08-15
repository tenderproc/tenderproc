"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const t = useTranslations("Header");
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={signOut} className="hover:text-ink transition-colors">
      {t("signOut")}
    </button>
  );
}
