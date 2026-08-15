"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { SECTORS } from "@/lib/sectors";
import { COMPANY_SIZES } from "@/lib/companySizes";
import { authErrorMessage } from "@/lib/authErrors";

export default function SignupPage() {
  const t = useTranslations("Signup");
  const tSector = useTranslations("Enums.sector");
  const tCompanySize = useTranslations("Enums.companySize");
  const tAuthError = useTranslations("Errors.auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [companySize, setCompanySize] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  function toggleSector(key: string) {
    setSectors((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sectors.length === 0) {
      setError(t("pickSector"));
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      setError(authErrorMessage(error.message, tAuthError));
      return;
    }

    if (data.user) {
      // Best-effort: a signup with an unreachable email still creates the
      // auth user, so this seeds their profile even before they confirm.
      await fetch("/api/signup-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          companyName,
          address,
          sectors,
          companySize,
          description,
        }),
      }).catch(() => {});
    }

    setLoading(false);
    if (!data.session) {
      // Email confirmation is required on this Supabase project before a
      // session exists — there's no session to redirect with yet.
      setCheckEmail(true);
      return;
    }
    router.push("/opportunities");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-xs font-semibold tracking-[0.15em] text-inkDim uppercase">
            TenderProc
          </p>
          <h1 className="font-display font-bold text-3xl mt-2 text-ink tracking-tight">
            {t("checkEmailHeading")}
          </h1>
          <p className="text-sm text-inkDim mt-3 leading-relaxed">
            {t("checkEmailBody", { email })}
          </p>
          <Link href="/login" className="inline-block mt-6 underline text-sm text-ink">
            {t("backToLogin")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
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
          className="border border-line bg-white rounded-2xl p-6 space-y-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                {t("email")}
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
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
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder={t("passwordPlaceholder")}
                minLength={6}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                {t("companyName")}
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder={t("companyNamePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                {t("address")}
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder={t("addressPlaceholder")}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
              {t("companySize")}
            </label>
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            >
              <option value="">{t("preferNotToSay")}</option>
              {COMPANY_SIZES.map((s) => (
                <option key={s.key} value={s.key}>
                  {tCompanySize(s.key)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
              {t("descriptionLabel")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("descriptionPlaceholder")}
              className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-2">
              {t("sectors")}
            </label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {SECTORS.map((sector) => (
                <label
                  key={sector.key}
                  className="flex items-center gap-2 text-sm text-ink cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={sectors.includes(sector.key)}
                    onChange={() => toggleSector(sector.key)}
                  />
                  {tSector(sector.key)}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-stamp">{error}</p>}

          <button
            disabled={loading}
            className="w-full bg-accent text-white py-2.5 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors disabled:opacity-50"
          >
            {loading ? t("creatingAccount") : t("signUp")}
          </button>
        </form>

        <p className="text-xs text-inkDim text-center mt-6">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="underline">
            {t("logIn")}
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
