import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import ManageBillingLink from "@/components/billing/ManageBillingLink";
import UpgradeButton from "@/components/billing/UpgradeButton";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveTier, rowToUserSubscription, SUBSCRIPTION_COLUMNS } from "@/lib/billing/tiers";
import { peekTokens } from "@/lib/billing/tokens";
import { INTL_LOCALE, type Locale } from "@/lib/locales";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const t = await getTranslations("BillingPage");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/billing");

  const { data: row } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  const subscription = rowToUserSubscription(row);
  const effective = getEffectiveTier(subscription);
  const tokenStatus = effective.tier === "FREE" ? await peekTokens(user.id) : null;

  function formatDate(d: string | null) {
    if (!d) return null;
    const date = new Date(d);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString(INTL_LOCALE[locale], { day: "2-digit", month: "short", year: "numeric" });
  }

  const nextRenewal = formatDate(subscription.currentPeriodEnd);
  const graceEnds = formatDate(subscription.gracePeriodEndsAt);

  return (
    <div>
      <Header />
      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-display font-bold text-3xl text-ink tracking-tight">{t("heading")}</h1>

        {effective.inGracePeriod && (
          <div className="mt-6 border border-stamp/30 bg-stamp/5 rounded-doc p-4">
            <p className="text-sm font-medium text-stamp">{t("paymentFailedHeading")}</p>
            <p className="text-sm text-inkDim mt-1">
              {graceEnds ? t("paymentFailedBodyWithDate", { date: graceEnds }) : t("paymentFailedBody")}
            </p>
          </div>
        )}

        <div className="mt-6 border border-line rounded-doc p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkDim">{t("currentPlan")}</p>
          <p className="font-display font-semibold text-2xl text-ink mt-1">
            {t(`tierNames.${effective.tier}`)}
          </p>
          {nextRenewal && effective.status === "active" && (
            <p className="text-sm text-inkDim mt-2">{t("renewsOn", { date: nextRenewal })}</p>
          )}
          {subscription.status === "canceled" && (
            <p className="text-sm text-inkDim mt-2">{t("canceled")}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {subscription.paddleCustomerId && <ManageBillingLink />}
            {effective.tier !== "PREMIUM" && (
              <UpgradeButton
                tier={effective.tier === "FREE" ? "PRO" : "PREMIUM"}
                label={t(effective.tier === "FREE" ? "upgradeToPro" : "upgradeToPremium")}
                userId={user.id}
                email={user.email ?? undefined}
                paddleCustomerId={subscription.paddleCustomerId ?? undefined}
                className="text-sm font-medium text-white bg-accent rounded-doc px-4 py-2 hover:bg-accentDim transition-colors disabled:opacity-50"
              />
            )}
          </div>
        </div>

        {tokenStatus && !tokenStatus.unlimited && (
          <div className="mt-6 border border-line rounded-doc p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-inkDim">{t("tokensHeading")}</p>
            <p className="font-display font-semibold text-2xl text-ink mt-1">
              {t("tokensRemaining", { count: tokenStatus.balance })}
            </p>
            <p className="text-sm text-inkDim mt-2">{t("tokensResetInfo")}</p>
          </div>
        )}

        <p className="text-xs text-inkDim mt-4">
          <Link href="/refund" className="underline hover:text-ink transition-colors">
            {t("refundPolicy")}
          </Link>
        </p>
      </main>
    </div>
  );
}
