import { createClient } from "./supabase/server";
import { CompanyProfile } from "./scoring";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface SavedCompanyProfile {
  savedSectors: string[];
  savedLanguage: string | null;
  profile: CompanyProfile;
}

// Shared between the Opportunities page (which needs savedSectors/savedLanguage
// for CPV/language filtering) and the async match-scoring API route (which only
// needs the CompanyProfile shape) — both must derive the identical profile so
// getMatchScores's profileHash cache key stays consistent between them.
//
// Matching-relevant fields (sectors/description/address/companySize) come
// from `companies` — the same table /company edits — so filling in that
// page actually changes what the AI matcher sees, instead of the two
// staying permanently out of sync (see
// supabase-company-profile-unification-migration.sql for the backfill this
// depends on). `language` is a separate UI/notice-filtering preference,
// not a matching input (confirmed unused in lib/scoring.ts's prompt), and
// stays on `profiles` — untouched by that migration.
export async function getSavedCompanyProfile(
  supabase: SupabaseServerClient,
  userId: string
): Promise<SavedCompanyProfile> {
  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase
      .from("companies")
      .select("sector_keys, description, regions_served, company_size")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("language").eq("id", userId).maybeSingle(),
  ]);

  const savedSectors: string[] = company?.sector_keys ?? [];
  const savedLanguage: string | null = profile?.language ?? null;

  return {
    savedSectors,
    savedLanguage,
    profile: {
      sectors: savedSectors,
      languages: savedLanguage ? [savedLanguage] : [],
      description: company?.description ?? "",
      address: (company?.regions_served ?? []).join(", "),
      companySize: company?.company_size ?? "",
    },
  };
}
