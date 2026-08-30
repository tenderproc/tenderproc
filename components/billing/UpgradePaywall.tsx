import Link from "next/link";
import { getTranslations } from "next-intl/server";
import UpgradeButton from "./UpgradeButton";

/** Shared "this needs a paid plan" empty state for a gated page (Market
 * overview, Workflow board). Reused across features instead of each page
 * inventing its own upsell UI — page-specific copy (why this feature is
 * worth it) is passed in as `description` from that page's own translation
 * namespace; only the generic tier label/CTA/login strings live in the
 * shared "UpgradePaywall" namespace. */
export default async function UpgradePaywall({
  requiredTier,
  description,
  user,
  loginNext,
}: {
  requiredTier: "PRO" | "PREMIUM";
  description: string;
  user: { id: string; email?: string | null; paddleCustomerId?: string | null } | null;
  loginNext: string;
}) {
  const t = await getTranslations("UpgradePaywall");

  return (
    <div className="border border-line rounded-2xl bg-white p-8 text-center max-w-md mx-auto">
      <p className="text-xs font-semibold uppercase tracking-wide text-inkDim mb-2">
        {t(requiredTier === "PREMIUM" ? "premiumFeature" : "proFeature")}
      </p>
      <p className="text-sm text-inkDim mb-6">{description}</p>
      {user ? (
        <UpgradeButton
          tier={requiredTier}
          label={t(requiredTier === "PREMIUM" ? "upgradeToPremium" : "upgradeToPro")}
          userId={user.id}
          email={user.email ?? undefined}
          paddleCustomerId={user.paddleCustomerId ?? undefined}
          className="inline-block text-sm font-medium text-white bg-accent rounded-doc px-5 py-2.5 hover:bg-accentDim transition-colors disabled:opacity-50"
        />
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(loginNext)}`}
          className="inline-block text-sm font-medium text-white bg-accent rounded-doc px-5 py-2.5 hover:bg-accentDim transition-colors"
        >
          {t("logIn")}
        </Link>
      )}
    </div>
  );
}
