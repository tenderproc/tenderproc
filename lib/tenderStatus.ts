/**
 * Source-agnostic open/deadline-passed status, derived purely from the
 * submission deadline. Deliberately doesn't attempt an "awarded" state —
 * TED's contract_awards table (Feature 1) stores award notices as
 * independent rows with their own publication number, with no reliable
 * link back to the originating open-call notice, so claiming "awarded"
 * here would be a guess rather than a fact. See docs/database.md's
 * `contract_awards` entry.
 */
export type TenderStatus = "open" | "deadlinePassed" | "unknown";

export function tenderStatus(deadline: string | null, now: Date = new Date()): TenderStatus {
  if (!deadline) return "unknown";
  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) return "unknown";
  return deadlineDate.getTime() >= now.getTime() ? "open" : "deadlinePassed";
}
