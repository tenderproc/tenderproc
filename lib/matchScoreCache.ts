import { createClient } from "./supabase/server";
import { CompanyProfile, MatchScore, hasProfileSignal, profileHash, scoreTenders } from "./scoring";
import { TenderNotice } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface ScoreRow {
  publication_number: string;
  score: number;
  summary: string;
  criteria: MatchScore["criteria"];
}

// Looks up cached scores keyed by (user, tender, profile fingerprint); scores
// any tenders missing from the cache in a single batched AI call, then
// persists the result so repeat page loads don't re-score for free.
export async function getMatchScores(
  supabase: SupabaseServerClient,
  userId: string,
  tenders: TenderNotice[],
  profile: CompanyProfile
): Promise<Record<string, MatchScore>> {
  if (tenders.length === 0 || !hasProfileSignal(profile)) return {};

  const hash = profileHash(profile);
  const publicationNumbers = tenders.map((t) => t.publicationNumber);

  const { data: cached } = await supabase
    .from("tender_scores")
    .select("publication_number, score, summary, criteria")
    .eq("user_id", userId)
    .eq("profile_hash", hash)
    .in("publication_number", publicationNumbers);

  const scores: Record<string, MatchScore> = {};
  for (const row of (cached ?? []) as ScoreRow[]) {
    scores[row.publication_number] = {
      publicationNumber: row.publication_number,
      score: row.score,
      summary: row.summary,
      criteria: row.criteria ?? [],
    };
  }

  const missing = tenders.filter((t) => !scores[t.publicationNumber]);
  if (missing.length > 0) {
    // Chunked so a single call's JSON output (score + summary + criteria per
    // tender) can't get cut off by max_tokens on larger result pages, which
    // would fail the whole batch's JSON.parse and silently drop every score.
    const CHUNK_SIZE = 10;
    const chunks: TenderNotice[][] = [];
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      chunks.push(missing.slice(i, i + CHUNK_SIZE));
    }
    const chunkResults = await Promise.all(chunks.map((chunk) => scoreTenders(chunk, profile)));
    const fresh = chunkResults.flat();
    if (fresh.length > 0) {
      await supabase.from("tender_scores").upsert(
        fresh.map((s) => ({
          user_id: userId,
          publication_number: s.publicationNumber,
          score: s.score,
          summary: s.summary,
          criteria: s.criteria,
          profile_hash: hash,
          computed_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,publication_number" }
      );
      for (const s of fresh) scores[s.publicationNumber] = s;
    }
  }

  return scores;
}
