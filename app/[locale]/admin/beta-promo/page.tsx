import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEEDBACK_MILESTONES } from "@/lib/billing/betaPromo";

export const dynamic = "force-dynamic";

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Internal-only view of the 20 beta feedback promo subscribers — the app's
 * first admin-gated page (no role/is_admin column exists; see ADMIN_EMAILS
 * in .env.example). proxy.ts already requires a signed-in session for any
 * non-public path including this one; the ADMIN_EMAILS check below is the
 * second, admin-specific gate. Returns a plain 404 (not a redirect) for a
 * signed-in-but-not-allowlisted user, so this page's existence isn't
 * revealed to them either.
 */
export default async function BetaPromoAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const admin = createAdminClient();
  const { data: redemptions, error } = await admin
    .from("beta_promo_redemptions")
    .select(
      "id, user_id, tier, status, confirmed_at, promo_end_date, paddle_subscription_id"
    )
    .in("status", ["reserved", "confirmed"])
    .order("confirmed_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);

  const rows = redemptions ?? [];
  const emailByUserId = new Map<string, string>();
  for (const row of rows) {
    const userId = row.user_id as string;
    if (emailByUserId.has(userId)) continue;
    const { data } = await admin.auth.admin.getUserById(userId);
    emailByUserId.set(userId, data.user?.email ?? "(no email)");
  }

  const redemptionIds = rows.map((r) => r.id as string);
  const { data: feedback } = redemptionIds.length
    ? await admin
        .from("beta_feedback_responses")
        .select("redemption_id, milestone, dismissed, rating")
        .in("redemption_id", redemptionIds)
    : { data: [] };
  const feedbackByRedemption = new Map<string, Map<number, { dismissed: boolean; rating: number | null }>>();
  for (const f of feedback ?? []) {
    const key = f.redemption_id as string;
    if (!feedbackByRedemption.has(key)) feedbackByRedemption.set(key, new Map());
    feedbackByRedemption
      .get(key)!
      .set(f.milestone as number, { dismissed: f.dismissed as boolean, rating: f.rating as number | null });
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="font-display font-bold text-2xl text-ink">Beta feedback promo — {rows.length}/20</h1>
      <p className="text-sm text-inkDim mt-1">
        Confirmed and in-flight (reserved) redemptions of the 50%-off-for-6-months beta promo.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-line text-inkDim">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Tier</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Signup date</th>
              <th className="py-2 pr-4">Promo ends</th>
              {FEEDBACK_MILESTONES.map((m) => (
                <th key={m} className="py-2 pr-4">
                  Day {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const fb = feedbackByRedemption.get(row.id as string);
              return (
                <tr key={row.id as string} className="border-b border-line/50">
                  <td className="py-2 pr-4">{emailByUserId.get(row.user_id as string)}</td>
                  <td className="py-2 pr-4">{row.tier as string}</td>
                  <td className="py-2 pr-4">{row.status as string}</td>
                  <td className="py-2 pr-4">{formatDate(row.confirmed_at as string | null)}</td>
                  <td className="py-2 pr-4">{formatDate(row.promo_end_date as string | null)}</td>
                  {FEEDBACK_MILESTONES.map((m) => {
                    const entry = fb?.get(m);
                    const label = !entry
                      ? "pending"
                      : entry.dismissed
                        ? "skipped"
                        : `rated ${entry.rating ?? "—"}`;
                    return (
                      <td key={m} className="py-2 pr-4">
                        {label}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
