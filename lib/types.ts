export interface TenderNotice {
  publicationNumber: string;
  title: string;
  buyerName: string;
  buyerCountry: string;
  totalValue: string | null;
  /** Raw numeric value backing `totalValue`, for range filtering — null if no value field was present or parseable. */
  totalValueRaw: number | null;
  deadline: string | null;
  publicationDate: string | null;
  cpvCodes: string[];
  url: string;
}

export interface AwardedTender {
  publicationNumber: string;
  title: string;
  buyerName: string;
  winnerName: string;
  winnerCountry: string;
  value: string | null;
  valueRaw: number | null;
  publicationDate: string | null;
  cpvCodes: string[];
  url: string;
}

export interface EligibilityResult {
  verdict: "ELIGIBLE" | "REVIEW NEEDED" | "NOT ELIGIBLE";
  summary: string;
  keyRequirements: string[];
  deadlineFlag: string | null;
  disclaimer: string;
}
