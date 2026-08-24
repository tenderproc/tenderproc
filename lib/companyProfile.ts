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
export async function getSavedCompanyProfile(
  supabase: SupabaseServerClient,
  userId: string
): Promise<SavedCompanyProfile> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("sectors, language, company_description, address, company_size")
    .eq("id", userId)
    .maybeSingle();

  const savedSectors: string[] = profile?.sectors ?? [];
  const savedLanguage: string | null = profile?.language ?? null;

  return {
    savedSectors,
    savedLanguage,
    profile: {
      sectors: savedSectors,
      languages: savedLanguage ? [savedLanguage] : [],
      description: profile?.company_description ?? "",
      address: profile?.address ?? "",
      companySize: profile?.company_size ?? "",
    },
  };
}
