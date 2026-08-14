import {
  AnalyzeTenderInput,
  BidRecommendation,
  ComplianceReviewInput,
  ComplianceReviewResult,
  EvidenceMatch,
  FindCompanyEvidenceInput,
  GenerateBidRecommendationInput,
  GenerateResponseDraftInput,
  ResponseDraft,
  TenderAnalysis,
  ValidateResponseInput,
  ValidateResponseResult,
} from "./types";

/**
 * Provider-agnostic AI surface. Phase 1 added analyzeTender/
 * generateBidRecommendation; Phase 2 added evidence-finding, drafting, and
 * claim validation; Phase 3 adds pre-submission compliance review.
 */
export interface AIProvider {
  analyzeTender(input: AnalyzeTenderInput): Promise<TenderAnalysis>;
  generateBidRecommendation(input: GenerateBidRecommendationInput): Promise<BidRecommendation>;
  findCompanyEvidence(input: FindCompanyEvidenceInput): Promise<EvidenceMatch[]>;
  generateResponseDraft(input: GenerateResponseDraftInput): Promise<ResponseDraft>;
  validateResponse(input: ValidateResponseInput): Promise<ValidateResponseResult>;
  runComplianceReview(input: ComplianceReviewInput): Promise<ComplianceReviewResult>;
}
