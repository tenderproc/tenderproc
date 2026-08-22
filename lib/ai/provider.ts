import {
  AnalyzeTenderInput,
  AwardDurationExtraction,
  BidRecommendation,
  ComplianceReviewInput,
  ComplianceReviewResult,
  EvidenceMatch,
  ExtractAwardDurationInput,
  FindCompanyEvidenceInput,
  GenerateBidRecommendationInput,
  GenerateResponseDraftInput,
  MapRequirementEvidenceInput,
  MapRequirementEvidenceResult,
  ResponseDraft,
  TenderAnalysis,
  TranslateFieldsInput,
  ValidateResponseInput,
  ValidateResponseResult,
} from "./types";

/**
 * Provider-agnostic AI surface. Phase 1 added analyzeTender/
 * generateBidRecommendation; Phase 2 added evidence-finding, drafting, and
 * claim validation; Phase 3 added pre-submission compliance review.
 * Increment 1 enriches generateBidRecommendation with score dimensions and
 * disqualifying factors (the "TenderProc Score" / "Why Not Bid"), and adds
 * mapRequirementsToEvidence for tender-level, pre-bid evidence coverage.
 * Increment 2 adds translateFields for on-demand translation of AI-generated
 * free text into the user's chosen UI language. Tender Forecast adds
 * extractAwardDuration — a narrow fallback for award notices whose duration
 * isn't in TED's structured fields (see lib/ted.ts's parseAwardDuration).
 */
export interface AIProvider {
  analyzeTender(input: AnalyzeTenderInput): Promise<TenderAnalysis>;
  generateBidRecommendation(input: GenerateBidRecommendationInput): Promise<BidRecommendation>;
  findCompanyEvidence(input: FindCompanyEvidenceInput): Promise<EvidenceMatch[]>;
  generateResponseDraft(input: GenerateResponseDraftInput): Promise<ResponseDraft>;
  validateResponse(input: ValidateResponseInput): Promise<ValidateResponseResult>;
  runComplianceReview(input: ComplianceReviewInput): Promise<ComplianceReviewResult>;
  mapRequirementsToEvidence(input: MapRequirementEvidenceInput): Promise<MapRequirementEvidenceResult>;
  translateFields(input: TranslateFieldsInput): Promise<Record<string, string>>;
  extractAwardDuration(input: ExtractAwardDurationInput): Promise<AwardDurationExtraction>;
}
