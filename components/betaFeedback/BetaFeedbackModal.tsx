"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Milestone = 7 | 30 | 90;

/** Mounted globally in app/layout.tsx next to SupportChatWidget — same
 * self-gating pattern: fetches /api/beta-feedback/pending on mount and
 * renders nothing unless a milestone is actually due for the signed-in
 * user. Anonymous visitors and non-beta-promo users always get { due: null }
 * from that route, so this is safe to mount unconditionally on every page. */
export default function BetaFeedbackModal() {
  const t = useTranslations("BetaPromo.modal");
  const [due, setDue] = useState<Milestone | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/beta-feedback/pending")
      .then((res) => (res.ok ? res.json() : { due: null }))
      .then((data) => {
        if (!cancelled && data.due) setDue(data.due);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!due) return null;

  async function respond(dismissed: boolean) {
    setSubmitting(true);
    try {
      await fetch("/api/beta-feedback/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone: due, dismissed, rating, comments }),
      });
      if (!dismissed) {
        setDone(true);
        setTimeout(() => setDue(null), 1500);
      } else {
        setDue(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6">
        {done ? (
          <p className="text-sm text-ink font-medium">{t("thanks")}</p>
        ) : (
          <>
            <h2 className="font-display font-semibold text-lg text-ink">{t(`heading${due}` as "heading7")}</h2>
            <p className="text-sm text-inkDim mt-2">{t("intro")}</p>

            <label className="block text-sm text-ink mt-4 mb-1">{t("ratingLabel")}</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`w-9 h-9 rounded-full border text-sm font-medium ${
                    rating === n ? "bg-accent text-white border-accent" : "border-line text-ink hover:bg-paperDim"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <label className="block text-sm text-ink mt-4 mb-1">{t("commentsLabel")}</label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={t("commentsPlaceholder")}
              rows={3}
              className="w-full border border-line rounded-doc px-3 py-2 text-sm"
            />

            <div className="flex justify-between items-center mt-5">
              <button
                type="button"
                onClick={() => respond(true)}
                disabled={submitting}
                className="text-sm text-inkDim hover:text-ink"
              >
                {t("skip")}
              </button>
              <button
                type="button"
                onClick={() => respond(false)}
                disabled={submitting || rating === null}
                className="bg-accent text-white px-4 py-2 rounded-doc text-sm font-medium hover:bg-accentDim disabled:opacity-50"
              >
                {t("submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
