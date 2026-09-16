import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import Header from "@/components/Header";
import OnboardingBanner from "@/components/OnboardingBanner";
import SearchFilters from "@/components/SearchFilters";
import PreferencesSidebar from "@/components/PreferencesSidebar";
import OpportunitiesList from "@/components/OpportunitiesList";
import OpportunitiesListSkeleton from "@/components/OpportunitiesListSkeleton";
import { createClient } from "@/lib/supabase/server";
import { getSavedCompanyProfile } from "@/lib/companyProfile";
import { hasProfileSignal } from "@/lib/scoring";
import { FREE_SECTOR_LIMIT, getEffectiveTier, rowToUserSubscription, SUBSCRIPTION_COLUMNS } from "@/lib/billing/tiers";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cpv?: string; minScore?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("Opportunities");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedSectors: string[] = [];
  let savedLanguage: string | null = null;
  let showMatchFilter = false;
  let showOnboarding = false;
  let tier: "FREE" | "PRO" | "PREMIUM" = "FREE";
  if (user) {
    const [saved, { data: subRow }] = await Promise.all([
      getSavedCompanyProfile(supabase, user.id),
      supabase.from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("user_id", user.id).maybeSingle(),
    ]);
    savedLanguage = saved.savedLanguage;
    showMatchFilter = hasProfileSignal(saved.profile);
    // Deliberately narrower than showMatchFilter/hasProfileSignal above:
    // signup already requires picking >=1 sector, so hasProfileSignal's
    // `sectors.length > 0` clause is true for nearly every real account from
    // the moment it exists — gating the onboarding banner on it suppressed
    // the banner for essentially its entire target audience (confirmed live
    // 2026-09-10, commit 3e7a6b1). This checks the richer profile fields
    // (description/address) that signup does NOT collect, so the banner
    // still shows until the user has actually filled in /company.
    showOnboarding = !saved.profile.description.trim() && !saved.profile.address.trim();
    tier = getEffectiveTier(rowToUserSubscription(subRow)).tier;
    // "/pricing": Free is capped to 1 sector. Capping what's *applied* here
    // (rather than what's stored in `profiles.sectors`) is enough on its
    // own — a Free user with more sectors saved from before, or saved
    // directly via the client, just has the extras ignored.
    savedSectors = tier === "FREE" ? saved.savedSectors.slice(0, FREE_SECTOR_LIMIT) : saved.savedSectors;
  }

  // "/pricing" sells "Opportunities feed, all sectors" as a Pro/Premium
  // feature ("Opportunities feed for 1 sector" on Free) — an unfiltered feed
  // is the thing being paid for. Signup already requires picking >=1 sector
  // (see the "pickSector" validation), so a Free user only ever reaches zero
  // saved sectors by unchecking their one sector in the sidebar (confirmed
  // live 2026-09-10: doing so silently unlocks the full unfiltered feed,
  // bypassing the paywall). A manual keyword/CPV search intentionally
  // overrides the sector filter for everyone, so this only guards the
  // default (no q/cpv) feed.
  const freeNoSectorSelected =
    tier === "FREE" && !params.q && !params.cpv && savedSectors.length === 0 && Boolean(user);

  return (
    <div>
      <Header />
      <main id="main-content" className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row gap-8">
        {user && (
          <PreferencesSidebar
            userId={user.id}
            initialSectors={savedSectors}
            initialLanguage={savedLanguage}
            sectorLimit={tier === "FREE" ? FREE_SECTOR_LIMIT : null}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-inkDim">
              {t("eyebrow")}
            </p>
            <h1 className="font-display font-bold text-3xl text-ink mt-1 tracking-tight">
              {t("heading")}
            </h1>
            <p className="text-sm text-inkDim mt-2 max-w-xl leading-relaxed">
              {t("description")}
            </p>
          </div>

          {user && showOnboarding && <OnboardingBanner userId={user.id} />}

          <SearchFilters showMatchFilter={showMatchFilter} />

          {/* TED, BOSA, and the regional sources are live external calls
              (measured 1.5-2.5s+ combined, worse on a cold BOSA OAuth
              handshake) — isolated in their own Suspense boundary so
              everything above (header, sidebar, filters), which only needs
              the fast Supabase auth/profile lookups, paints immediately
              instead of waiting behind them too. */}
          <Suspense fallback={<OpportunitiesListSkeleton />}>
            <OpportunitiesList
              params={params}
              savedSectors={savedSectors}
              savedLanguage={savedLanguage}
              freeNoSectorSelected={freeNoSectorSelected}
              showMatchFilter={showMatchFilter}
              hasUser={Boolean(user)}
            />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
