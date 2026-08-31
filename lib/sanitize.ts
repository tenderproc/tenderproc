/** Strips HTML-tag-like substrings from user-supplied free text, as
 * defense-in-depth against stored script-tag payloads (found one live on
 * production — see supabase-company-text-sanitization-migration.sql for
 * the full writeup and the DB-trigger equivalent of this same logic,
 * which covers `companies` and its child tables since those are written
 * directly from the browser via the Supabase client, bypassing any server
 * route). This mirrors that trigger's regex exactly so behavior is
 * consistent regardless of which write path a given field goes through.
 *
 * Not a full HTML sanitizer — deliberately simple tag-stripping, matching
 * the DB trigger. A stray "<"/">" with no matching tag-shaped substring
 * (e.g. "revenue < €1M") passes through untouched. */
export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}
