export type RequirementCategory =
  | "eligibility"
  | "administrative"
  | "technical"
  | "experience"
  | "certification"
  | "personnel"
  | "financial"
  | "pricing"
  | "document"
  | "award_criterion"
  | "other";

export const REQUIREMENT_CATEGORIES: RequirementCategory[] = [
  "eligibility",
  "administrative",
  "technical",
  "experience",
  "certification",
  "personnel",
  "financial",
  "pricing",
  "document",
  "award_criterion",
  "other",
];

export type RequirementStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETE"
  | "BLOCKED"
  | "NOT_APPLICABLE";

export interface AwardCriterion {
  criterion: string;
  weight: string | null;
  description: string | null;
}

export interface ExtractedRequirement {
  title: string;
  description: string | null;
  category: RequirementCategory;
  mandatory: boolean;
  sourcePage: number | null;
  sourceSection: string | null;
}

export interface TenderContract {
  title: string | null;
  contractingAuthority: string | null;
  referenceNumber: string | null;
  location: string | null;
  estimatedValue: number | null;
  currency: string | null;
  publicationDate: string | null;
  submissionDeadline: string | null;
  contractDuration: string | null;
}

export interface TenderAnalysis {
  summary: string;
  contract: TenderContract;
  awardCriteria: AwardCriterion[];
  requirements: ExtractedRequirement[];
  requiredDocuments: string[];
  risks: string[];
  ambiguities: string[];
}

export interface AnalyzeTenderInput {
  documentText: string;
  fileName?: string;
}

/** Distilled, read-only view of a company's knowledge base for AI consumption.
 * Every field here traces back to a row the user entered — nothing here is
 * ever invented, so this is the only source of "company facts" the AI may use. */
export interface CompanyKnowledge {
  name: string;
  description: string | null;
  website: string | null;
  companySize: string | null;
  employeeCount: number | null;
  regionsServed: string[];
  languages: string[];
  industries: string[];
  services: { name: string; description: string | null }[];
  certifications: {
    name: string;
    issuingOrganization: string | null;
    expiryDate: string | null;
  }[];
  references: {
    client: string;
    projectName: string | null;
    description: string | null;
    contractValue: number | null;
    isPublic: boolean | null;
    services: string[];
  }[];
}

export type BidMatchLabel = "Strong match" | "Good match" | "Moderate match" | "Weak match";
export type BidRecommendationVerdict = "BID" | "CONSIDER" | "NO-BID";
export type BidConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface BidRecommendation {
  score: number;
  matchLabel: BidMatchLabel;
  recommendation: BidRecommendationVerdict;
  confidence: BidConfidence;
  positiveFactors: string[];
  risks: string[];
  missingRequirements: string[];
  estimatedEffortHours: { min: number; max: number } | null;
}

export interface GenerateBidRecommendationInput {
  tenderAnalysis: TenderAnalysis;
  requirements: ExtractedRequirement[];
  company: CompanyKnowledge;
}
