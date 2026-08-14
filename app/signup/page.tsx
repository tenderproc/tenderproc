"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SECTORS } from "@/lib/sectors";

const COMPANY_SIZES = [
  { key: "solo", label: "Solo / freelance" },
  { key: "1-9", label: "1–9 employees" },
  { key: "10-49", label: "10–49 employees" },
  { key: "50-249", label: "50–249 employees" },
];

export default function SignupPage() {
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
      setError("Pick at least one sector.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
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
            Check your email
          </h1>
          <p className="text-sm text-inkDim mt-3 leading-relaxed">
            We sent a confirmation link to {email}. Click it, then log in —
            your company profile is already saved.
          </p>
          <Link href="/login" className="inline-block mt-6 underline text-sm text-ink">
            Back to login
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
            Create your account
          </h1>
          <p className="text-sm text-inkDim mt-3 leading-relaxed">
            Tell us about your business — it powers the tenders you see and
            each tender&apos;s match score.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="border border-line bg-white rounded-2xl p-6 space-y-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                Email
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
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                Company name
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder="e.g. Van Damme Cleaning bv"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
                Address
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                placeholder="e.g. Antwerp"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
              Company size
            </label>
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            >
              <option value="">Prefer not to say</option>
              {COMPANY_SIZES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
              What does your business do?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="A couple sentences is enough — this is what powers each tender's match score."
              className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-2">
              Sectors
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
                  {sector.label}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-stamp">{error}</p>}

          <button
            disabled={loading}
            className="w-full bg-accent text-white py-2.5 rounded-doc font-medium shadow-sm hover:bg-accentDim transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="text-xs text-inkDim text-center mt-6">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
          . ·{" "}
          <Link href="/pricing" className="underline">
            View pricing
          </Link>
        </p>
      </div>
    </main>
  );
}
