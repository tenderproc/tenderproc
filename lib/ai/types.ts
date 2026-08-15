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
  services: { id: string; name: string; description: string | null }[];
  certifications: {
    id: string;
    name: string;
    issuingOrganization: string | null;
    expiryDate: string | null;
  }[];
  references: {
    id: string;
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

/** The named dimensions of the TenderProc Score. `competition` has no real
 * data source in this codebase yet (no competitor/historical intelligence
 * built) — it is always returned with score: null rather than a guessed
 * number; see ScoreDimension. */
export type ScoreDimensionKey =
  | "capability_fit"
  | "mandatory_requirements"
  | "experience"
  | "geographic_fit"
  | "financial_eligibility"
  | "certification_fit"
  | "competition"
  | "preparation_effort"
  | "strategic_value";

export const SCORE_DIMENSION_KEYS: ScoreDimensionKey[] = [
  "capability_fit",
  "mandatory_requirements",
  "experience",
  "geographic_fit",
  "financial_eligibility",
  "certification_fit",
  "competition",
  "preparation_effort",
  "strategic_value",
];

/** One line of the TenderProc Score breakdown. `score` is null when the
 * dimension genuinely isn't assessable from data this app has (e.g.
 * `competition` with no historical bidder data) — the model is instructed to
 * never invent a number to fill the gap, and unavailableReason explains why. */
export interface ScoreDimension {
  key: ScoreDimensionKey;
  label: string;
  score: number | null;
  explanation: string;
  unavailableReason: string | null;
}

export type DisqualifierSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/** A concrete reason NOT to bid, grounded in an actual gap between a tender
 * requirement and the company's known profile — never an assumption that a
 * gap is a legal disqualifier unless the tender text itself says so. */
export interface DisqualifyingFactor {
  severity: DisqualifierSeverity;
  requirement: string;
  companyStatus: string;
  evidence: string | null;
  explanation: string;
  possibleMitigation: string | null;
}

export interface BidRecommendation {
  score: number;
  matchLabel: BidMatchLabel;
  recommendation: BidRecommendationVerdict;
  confidence: BidConfidence;
  positiveFactors: string[];
  risks: string[];
  missingRequirements: string[];
  estimatedEffortHours: { min: number; max: number } | null;
  dimensions: ScoreDimension[];
  disqualifyingFactors: DisqualifyingFactor[];
}

export interface GenerateBidRecommendationInput {
  tenderAnalysis: TenderAnalysis;
  requirements: ExtractedRequirement[];
  company: CompanyKnowledge;
}

// --- Phase 2: bid workspace / evidence / drafting / claim validation ---

export type EvidenceType = "service" | "certification" | "reference";
export type EvidenceRelevance = "High" | "Medium" | "Low";

/** A candidate piece of company evidence for a requirement. `id` always
 * traces back to a real company_services/company_certifications/
 * company_references row — parseEvidenceMatches() drops anything that
 * doesn't, so this can never point at an invented source. */
export interface EvidenceMatch {
  type: EvidenceType;
  id: string;
  label: string;
  relevance: EvidenceRelevance;
  reason: string;
}

export interface RequirementRef {
  title: string;
  description: string | null;
  category: RequirementCategory;
  mandatory: boolean;
}

export interface FindCompanyEvidenceInput {
  requirement: RequirementRef;
  company: CompanyKnowledge;
}

/** Evidence the user has actually selected to draft with — full detail text,
 * not just a label, so the draft can be specific rather than generic. */
export interface SelectedEvidence {
  type: EvidenceType;
  id: string;
  label: string;
  detail: string;
}

export interface GenerateResponseDraftInput {
  requirement: RequirementRef;
  tenderTitle: string | null;
  contractingAuthority: string | null;
  awardCriterion: { criterion: string; description: string | null } | null;
  evidence: SelectedEvidence[];
  company: CompanyKnowledge;
}

export interface ResponseDraft {
  draft: string;
  confidence: BidConfidence;
  warnings: string[];
}

export interface ValidateResponseInput {
  draftText: string;
  evidence: SelectedEvidence[];
  company: CompanyKnowledge;
}

export interface ValidateResponseResult {
  unsupportedClaims: string[];
}

// --- Phase 3: pre-submission compliance review ---

/** One drafted response, reduced to what a cross-response consistency check
 * needs — not the full requirement/evidence context those other passes use. */
export interface ComplianceReviewResponse {
  requirementTitle: string;
  category: RequirementCategory;
  draftText: string;
}

export interface ComplianceReviewInput {
  responses: ComplianceReviewResponse[];
  company: CompanyKnowledge;
}

/** Deliberately narrow: counts/scores/missing-requirement-or-document lists
 * are all computed directly from bid_requirements/bid_documents/bid_warnings
 * rows in the API route, not asked of the model. This is the one thing that
 * genuinely needs language understanding — contradictions between different
 * drafted responses, or between a response and the company profile. */
export interface ComplianceReviewResult {
  inconsistencies: string[];
}

// --- Increment 1: requirement -> evidence mapping (tender-level, pre-bid) ---

export type EvidenceCoverageStatus =
  | "VERIFIED"
  | "PARTIAL"
  | "MISSING"
  | "CONTRADICTED"
  | "NEEDS_REVIEW";

export const EVIDENCE_COVERAGE_STATUSES: EvidenceCoverageStatus[] = [
  "VERIFIED",
  "PARTIAL",
  "MISSING",
  "CONTRADICTED",
  "NEEDS_REVIEW",
];

/** One requirement's evidence coverage. `evidence` items always trace back to
 * real company rows — parseRequirementEvidenceMapping() drops anything that
 * doesn't, and drops the whole mapping if requirementId isn't one of the
 * requirements actually given as input. */
export interface RequirementEvidenceMapping {
  requirementId: string;
  status: EvidenceCoverageStatus;
  confidence: BidConfidence;
  notes: string;
  evidence: { type: EvidenceType; id: string; label: string }[];
}

export interface RequirementForMapping {
  id: string;
  title: string;
  description: string | null;
  category: RequirementCategory;
  mandatory: boolean;
}

export interface MapRequirementEvidenceInput {
  requirements: RequirementForMapping[];
  company: CompanyKnowledge;
}

export interface MapRequirementEvidenceResult {
  mappings: RequirementEvidenceMapping[];
}
