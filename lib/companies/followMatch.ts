import { normalizeCompanyName } from "./normalize";

export interface FollowableAward {
  id: string;
  winnerName: string | null;
}

export interface FollowedCompany {
  userId: string;
  /** Already normalized, as stored in followed_companies.followed_company_name. */
  followedCompanyName: string;
}

export interface FollowMatch {
  userId: string;
  followedCompanyName: string;
  contractAwardId: string;
}

/**
 * Matches newly-ingested/updated award notices against every
 * followed_companies row, using the same normalization as market share
 * (lib/companies/normalize.ts) so "Acme Trucks SA" and "ACME TRUCKS S.A."
 * are recognized as the same company. Pure/no I/O — the ingest-awards cron
 * does the actual insert into company_follow_matches with an
 * onConflict-ignore, so calling this again on an award that already
 * matched is harmless.
 */
export function matchFollowedCompanies(
  awards: FollowableAward[],
  followedCompanies: FollowedCompany[]
): FollowMatch[] {
  if (followedCompanies.length === 0 || awards.length === 0) return [];

  const followersByName = new Map<string, string[]>();
  for (const f of followedCompanies) {
    const list = followersByName.get(f.followedCompanyName) ?? [];
    list.push(f.userId);
    followersByName.set(f.followedCompanyName, list);
  }

  const matches: FollowMatch[] = [];
  for (const award of awards) {
    if (!award.winnerName) continue;
    const normalizedWinner = normalizeCompanyName(award.winnerName);
    if (!normalizedWinner) continue;
    const followers = followersByName.get(normalizedWinner);
    if (!followers) continue;
    for (const userId of followers) {
      matches.push({ userId, followedCompanyName: normalizedWinner, contractAwardId: award.id });
    }
  }
  return matches;
}
