"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { SECTORS } from "@/lib/sectors";
import { COMPANY_SIZES } from "@/lib/companySizes";
import { authErrorMessage } from "@/lib/authErrors";
import { PRICING_TIERS } from "@/lib/billing/pricingTiers";
import { isFreeEmailDomain } from "@/lib/freeEmailDomains";
import CompanySearchInput, { type CompanyMatch } from "@/components/CompanySearchInput";

// This banner just confirms which plan the user picked before signup, not
// a live quote — basePrice is the same static display price PricingCards
// falls back to before Paddle's localized total loads.
const PLAN_DISPLAY: Record<string, { nameKey: string; price: string }> = Object.fromEntries(
  PRICING_TIERS.map((tier) => [tier.key, { nameKey: `tiers.${tier.key}.name`, price: tier.basePrice }])
);

export default function SignupPage() {
  const t = useTranslations("Signup");
  const tPricing = useTranslations("Pricing");
  const tSector = useTranslations("Enums.sector");
  const tCompanySize = useTranslations("Enums.companySize");
  const tAuthError = useTranslations("Errors.auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Preselects from ?plan=, but the dropdown below lets the user change
  // their mind without leaving the form — an unrecognized/missing value
  // falls back to the free tier, same as the old plan-is-absent behavior.
  const [selectedPlan, setSelectedPlan] = useState(() => {
    const initial = searchParams.get("plan");
    return initial && PLAN_DISPLAY[initial] ? initial : "";
  });
  const planDisplay = selectedPlan ? PLAN_DISPLAY[selectedPlan] : undefined;
  // Set only by the /api/signup-fallback redirect — see that route for why:
  // it's the marker that the form's real onSubmit handler never attached
  // (a content blocker or failed chunk load broke hydration) and the
  // browser fell back to a plain HTML form submission instead.
  const hydrationFailed = searchParams.get("hydrationFailed") === "1";
  // Only set when signup-fallback/route.ts recovered a native form
  // submission (see that file) — never includes the password field, which
  // is deliberately excluded from the native fallback's `name` attributes
  // so it never round-trips through a redirect URL.
  const recovered = (key: string) => (hydrationFailed ? (searchParams.get(`r_${key}`) ?? "") : "");
  const [email, setEmail] = useState(() => recovered("email"));
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState(() => recovered("company"));
  const [companyNumber, setCompanyNumber] = useState<string | null>(null);
  const [address, setAddress] = useState(() => recovered("address"));
  const [sectors, setSectors] = useState<string[]>(() => {
    const raw = recovered("sectors");
    return raw ? raw.split(",").filter(Boolean) : [];
  });
  const [companySize, setCompanySize] = useState(() => recovered("size"));
  const [description, setDescription] = useState(() => recovered("description"));
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  function toggleSector(key: string) {
    setSectors((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function handleCompanyNameChange(name: string) {
    setCompanyName(name);
    // Free-typing after picking a result means the number may no longer
    // match what's on screen — drop it rather than silently keep a stale one.
    setCompanyNumber(null);
  }

  function handleCompanySelect(company: CompanyMatch) {
    setCompanyName(company.denomination);
    setCompanyNumber(company.enterpriseNumber);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Manual required-field checks replace native browser validation (see
    // `noValidate` on the <form> below) — native constraint-validation
    // tooltips are rendered in the *browser's* UI language, not the page's,
    // so a French-localized form could still pop up an English "Please
    // fill out this field" bubble (see the QA audit's French-only-persona
    // finding). This also gives the error an accessible name via
    // role="alert" below, which native tooltips don't reliably provide.
    if (!email.trim()) {
      setError(t("emailRequired"));
      document.getElementById("signup-email")?.focus();
      return;
    }
    if (!password) {
      setError(t("passwordRequiredField"));
      document.getElementById("signup-password")?.focus();
      return;
    }
    if (!companyName.trim()) {
      setError(t("companyNameRequired"));
      document.getElementById("signup-company")?.focus();
      return;
    }
    if (!address.trim()) {
      setError(t("addressRequired"));
      document.getElementById("signup-address")?.focus();
      return;
    }
    if (sectors.length === 0) {
      setError(t("pickSector"));
      return;
    }
    // "other" carries no CPV mapping (see lib/sectors.ts) — the AI match
    // score is the only thing that can make the feed relevant for these
    // users, and it needs an actual description to work with.
    if (sectors.includes("other") && description.trim().length < 15) {
      setError(t("descriptionRequiredForOther"));
      return;
    }
    if (!agreedToTerms) {
      setError(t("mustAgreeToTerms"));
      return;
    }
    // Free tier (no plan selected) is for businesses evaluating the
    // product — paid tiers aren't restricted to a work email.
    if (!planDisplay && isFreeEmailDomain(email)) {
      setError(t("professionalEmailRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // Carries the chosen plan through email confirmation — the user lands
    // back on /pricing?plan=... afterward, where PricingCards auto-opens
    // that tier's checkout (see autoOpenPlan), instead of losing the plan
    // choice and having to hunt for an upgrade button after confirming.
    const redirectPath = planDisplay ? `/pricing?plan=${selectedPlan}` : "/opportunities";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${redirectPath}` },
    });
    if (error) {
      setLoading(false);
      setError(authErrorMessage(error.message, tAuthError));
      return;
    }

    if (data.user) {
      // Not purely best-effort: this also carries the server-side backstop
      // for the free-tier professional-email restriction (the check above
      // only guards the UI — a direct supabase.auth.signUp() call would skip
      // it). A 403 here means the API already deleted the auth user it just
      // created, so surface that and stop instead of moving on to checkEmail.
      const profileRes = await fetch("/api/signup-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          email,
          isFreeTier: !planDisplay,
          companyName,
          companyNumber,
          address,
          sectors,
          companySize,
          description,
        }),
      }).catch(() => null);

      if (profileRes && profileRes.status === 403) {
        const { error: code } = await profileRes.json().catch(() => ({ error: null }));
        if (code === "professional_email_required") {
          setLoading(false);
          setError(t("professionalEmailRequired"));
          return;
        }
      }
    }

    setLoading(false);
    if (!data.session) {
      // Email confirmation is required on this Supabase project before a
      // session exists — there's no session to redirect with yet.
      setCheckEmail(true);
      return;
    }
    router.push(redirectPath);
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
          {planDisplay && (
            <p className="text-sm text-inkDim mt-3 leading-relaxed">
              {t("checkEmailPlanNote", { plan: tPricing(planDisplay.nameKey) })}
            </p>
          )}
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
          <div className="inline-flex items-center gap-2 mt-4">
            <label htmlFor="signup-plan" className="text-sm text-inkDim">
              {t("planLabel")}
            </label>
            <select
              id="signup-plan"
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="text-sm font-medium text-accent bg-accent/10 border border-accent/25 rounded-full px-3 py-1 focus:outline-hidden focus:ring-2 focus:ring-accent/40"
            >
              <option value="">{tPricing("tiers.free.name")}</option>
              {PRICING_TIERS.map((tier) => (
                <option key={tier.key} value={tier.key}>
                  {tPricing(`tiers.${tier.key}.name`)} — {tier.basePrice}
                  {tPricing("perMonth")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hydrationFailed && (
          <div className="border border-stamp/30 bg-stamp/5 rounded-doc p-4 text-sm text-stamp mb-6">
            {t("hydrationFailedBanner")}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          method="post"
          action="/api/signup-fallback"
          noValidate
          className="border border-line bg-white rounded-2xl p-6 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="signup-email" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                {t("email")}
              </label>
              <input
                id="signup-email"
                type="email"
                name="r_email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder="you@company.be"
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                {t("password")}
              </label>
              {/* Deliberately no `name` attribute: this field must never be
                  carried through the native-fallback redirect URL in
                  signup-fallback/route.ts — see the `recovered()` helper
                  above and that route's comments. */}
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder={t("passwordPlaceholder")}
                minLength={6}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="signup-company" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                {t("companyName")}
              </label>
              <CompanySearchInput
                id="signup-company"
                name="r_company"
                value={companyName}
                onChange={handleCompanyNameChange}
                onSelect={handleCompanySelect}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder={t("companyNamePlaceholder")}
              />
            </div>
            <div>
              <label htmlFor="signup-address" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                {t("address")}
              </label>
              <input
                id="signup-address"
                name="r_address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder={t("addressPlaceholder")}
              />
            </div>
          </div>

          <div>
            <label htmlFor="signup-size" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
              {t("companySize")}
            </label>
            <select
              id="signup-size"
              name="r_size"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
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
            <label htmlFor="signup-description" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
              {t("descriptionLabel")}
            </label>
            <textarea
              id="signup-description"
              name="r_description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("descriptionPlaceholder")}
              className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
          </div>

          {/* fieldset/legend is the standard accessible grouping for a set
              of checkboxes describing one choice ("which sectors") — a bare
              <label> here (the previous markup) has no single control to
              attach to and isn't announced as a group by screen readers. */}
          <fieldset className="border-0 p-0 m-0">
            <legend className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-2">
              {t("sectors")}
            </legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {SECTORS.map((sector) => (
                <label
                  key={sector.key}
                  className="flex items-center gap-2 text-sm text-ink cursor-pointer"
                >
                  <input
                    type="checkbox"
                    name="r_sectors"
                    value={sector.key}
                    className="accent-accent"
                    checked={sectors.includes(sector.key)}
                    onChange={() => toggleSector(sector.key)}
                  />
                  {tSector(sector.key)}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent mt-0.5"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
            />
            <span>
              {t.rich("agreeToTerms", {
                terms: (chunks) => (
                  <Link href="/terms" className="underline" target="_blank">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href="/privacy" className="underline" target="_blank">
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          </label>

          {error && (
            <p role="alert" className="text-sm text-stamp">
              {error}
            </p>
          )}

          <button
            disabled={loading}
            className="w-full bg-accent text-white py-2.5 rounded-doc font-medium shadow-xs hover:bg-accentDim transition-colors disabled:opacity-50"
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
