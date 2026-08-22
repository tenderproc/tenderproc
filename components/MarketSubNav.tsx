import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function MarketSubNav({ active }: { active: "overview" | "following" }) {
  const t = await getTranslations("Market");

  return (
    <nav className="flex items-center gap-1 border-b border-line mb-8">
      <Link
        href="/market"
        className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
          active === "overview" ? "border-accent text-ink" : "border-transparent text-inkDim hover:text-ink"
        }`}
      >
        {t("subNavOverview")}
      </Link>
      <Link
        href="/market/following"
        className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
          active === "following" ? "border-accent text-ink" : "border-transparent text-inkDim hover:text-ink"
        }`}
      >
        {t("subNavFollowing")}
      </Link>
    </nav>
  );
}
