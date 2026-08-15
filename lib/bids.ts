export interface BidStatus {
  key: string;
  label: string;
}

export const BID_STATUSES: BidStatus[] = [
  { key: "EVALUATION", label: "Evaluation" },
  { key: "PREPARATION", label: "Preparation" },
  { key: "REVIEW", label: "Review" },
  { key: "READY_TO_SUBMIT", label: "Ready to submit" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
  { key: "WITHDRAWN", label: "Withdrawn" },
];

export function bidStatusLabel(key: string, t?: (key: string) => string): string {
  if (t) {
    try {
      return t(key);
    } catch {
      // fall through to the English default below
    }
  }
  return BID_STATUSES.find((s) => s.key === key)?.label ?? key;
}

const DONE_STATUSES = new Set(["COMPLETE", "NOT_APPLICABLE"]);

export function computeProgress(requirements: { status: string }[]): number {
  if (requirements.length === 0) return 0;
  const done = requirements.filter((r) => DONE_STATUSES.has(r.status)).length;
  return Math.round((done / requirements.length) * 100);
}
