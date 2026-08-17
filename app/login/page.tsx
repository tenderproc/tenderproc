"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/authErrors";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations("Login");
  const tAuthError = useTranslations("Errors.auth");
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(authErrorMessage(error.message, tAuthError));
      return;
    }
    router.push(params.get("next") || "/opportunities");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-xs font-semibold tracking-[0.15em] text-inkDim uppercase">
            TenderProc
          </p>
          <h1 className="font-display font-bold text-3xl mt-2 text-ink tracking-tight">
            {t("heading")}
          </h1>
          <p className="text-sm text-inkDim mt-3 leading-relaxed">{t("subheading")}</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="border border-line bg-white rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
              {t("email")}
            </label>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
              placeholder="you@company.be"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
              {t("password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-sm text-stamp">{error}</p>}

          <button
            disabled={loading}
            className="w-full bg-accent text-white py-2.5 rounded-doc font-medium shadow-xs hover:bg-accentDim transition-colors disabled:opacity-50"
          >
            {loading ? t("loggingIn") : t("logIn")}
          </button>
        </form>

        <p className="text-xs text-inkDim text-center mt-6">
          {t("noAccount")}{" "}
          <Link href="/signup" className="underline">
            {t("signUp")}
          </Link>
          . ·{" "}
          <Link href="/pricing" className="underline">
            {t("viewPricing")}
          </Link>
        </p>
      </div>
    </main>
  );
}
