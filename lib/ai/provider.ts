import {
  AnalyzeTenderInput,
  BidRecommendation,
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
 * generateBidRecommendation; Phase 2 adds evidence-finding, drafting, and
 * claim validation. findTenderAmbiguities/runComplianceReview remain Phase 3
 * additions to this same interface (see docs/ai.md), not stubbed here.
 */
export interface AIProvider {
  analyzeTender(input: AnalyzeTenderInput): Promise<TenderAnalysis>;
  generateBidRecommendation(input: GenerateBidRecommendationInput): Promise<BidRecommendation>;
  findCompanyEvidence(input: FindCompanyEvidenceInput): Promise<EvidenceMatch[]>;
  generateResponseDraft(input: GenerateResponseDraftInput): Promise<ResponseDraft>;
  validateResponse(input: ValidateResponseInput): Promise<ValidateResponseResult>;
}
