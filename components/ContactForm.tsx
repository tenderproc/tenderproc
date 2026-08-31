"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

const REASON_KEYS = ["general", "pricing", "technical", "partnership", "multiCompany"] as const;

function isReasonKey(v: string | null): v is (typeof REASON_KEYS)[number] {
  return REASON_KEYS.includes(v as (typeof REASON_KEYS)[number]);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface FieldErrors {
  name?: string;
  email?: string;
  message?: string;
}

export default function ContactForm() {
  const t = useTranslations("Contact.form");
  const searchParams = useSearchParams();
  const initialReason = searchParams.get("reason");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [reason, setReason] = useState<(typeof REASON_KEYS)[number]>(
    isReasonKey(initialReason) ? initialReason : "general"
  );
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nextErrors: FieldErrors = {};
    if (!name.trim()) nextErrors.name = t("nameRequired");
    if (!email.trim()) nextErrors.email = t("emailRequired");
    else if (!isValidEmail(email)) nextErrors.email = t("emailInvalid");
    if (!message.trim()) nextErrors.message = t("messageRequired");

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, reason, message }),
      });
      if (!res.ok) throw new Error("request failed");
      setSent(true);
    } catch {
      setSubmitError(t("genericError"));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="border border-line bg-white rounded-2xl p-6">
        <h2 className="font-display font-semibold text-xl text-ink">{t("successHeading")}</h2>
        <p className="text-sm text-inkDim mt-2 leading-relaxed">{t("successBody")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="border border-line bg-white rounded-2xl p-6 space-y-5">
      <h2 className="font-display font-semibold text-xl text-ink">{t("heading")}</h2>

      <div>
        <label htmlFor="contact-name" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("name")}
        </label>
        <input
          id="contact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        {errors.name && (
          <p id="contact-name-error" className="text-sm text-stamp mt-1">
            {errors.name}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("email")}
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "contact-email-error" : undefined}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        {errors.email && (
          <p id="contact-email-error" className="text-sm text-stamp mt-1">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-company" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("company")}
        </label>
        <input
          id="contact-company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>

      <div>
        <label htmlFor="contact-reason" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("reason")}
        </label>
        <select
          id="contact-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as (typeof REASON_KEYS)[number])}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        >
          {REASON_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`reasonOptions.${key}`)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-xs font-medium uppercase tracking-wide text-inkDim mb-1">
          {t("message")}
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder={t("messagePlaceholder")}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          className="w-full border border-line rounded-doc px-3 py-2 bg-paper text-sm focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        {errors.message && (
          <p id="contact-message-error" className="text-sm text-stamp mt-1">
            {errors.message}
          </p>
        )}
      </div>

      {submitError && <p className="text-sm text-stamp">{submitError}</p>}

      <button
        disabled={sending}
        className="w-full bg-accent text-white py-2.5 rounded-doc font-medium shadow-xs hover:bg-accentDim transition-colors disabled:opacity-50"
      >
        {sending ? t("sending") : t("send")}
      </button>
    </form>
  );
}
