import { EligibilityResult } from "@/lib/types";

const VERDICT_STYLE: Record<EligibilityResult["verdict"], string> = {
  ELIGIBLE: "bg-moss/10 border-moss/25 text-moss",
  "REVIEW NEEDED": "bg-gold/10 border-gold/25 text-gold",
  "NOT ELIGIBLE": "bg-stamp/10 border-stamp/25 text-stamp",
};

export default function StampBadge({ verdict }: { verdict: EligibilityResult["verdict"] }) {
  return (
    <div
      className={`inline-flex items-center justify-center border rounded-full px-4 py-2 shrink-0 ${VERDICT_STYLE[verdict]}`}
      aria-label={`Eligibility verdict: ${verdict}`}
    >
      <span className="text-xs font-semibold tracking-wide text-center">
        {verdict}
      </span>
    </div>
  );
}
