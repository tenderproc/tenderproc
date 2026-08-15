import { useTranslations } from "next-intl";
import { EligibilityResult } from "@/lib/types";

type VerdictCode = "eligible" | "reviewNeeded" | "notEligible";

const VERDICT_CODE: Record<EligibilityResult["verdict"], VerdictCode> = {
  ELIGIBLE: "eligible",
  "REVIEW NEEDED": "reviewNeeded",
  "NOT ELIGIBLE": "notEligible",
};

const VERDICT_STYLE: Record<VerdictCode, string> = {
  eligible: "bg-moss/10 border-moss/25 text-moss",
  reviewNeeded: "bg-gold/10 border-gold/25 text-gold",
  notEligible: "bg-stamp/10 border-stamp/25 text-stamp",
};

export default function StampBadge({ verdict }: { verdict: EligibilityResult["verdict"] }) {
  const t = useTranslations("Enums.eligibilityVerdict");
  const code = VERDICT_CODE[verdict];
  const label = t(code);
  return (
    <div
      className={`inline-flex items-center justify-center border rounded-full px-4 py-2 shrink-0 ${VERDICT_STYLE[code]}`}
      aria-label={label}
    >
      <span className="text-xs font-semibold tracking-wide text-center">{label}</span>
    </div>
  );
}
