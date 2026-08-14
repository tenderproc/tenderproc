import {
  AnalyzeTenderInput,
  BidRecommendation,
  GenerateBidRecommendationInput,
  TenderAnalysis,
} from "./types";

/**
 * Provider-agnostic AI surface for Phase 1. Only the two methods Phase 1
 * needs are defined here — findCompanyEvidence/generateResponseDraft/
 * validateResponse/findTenderAmbiguities/runComplianceReview are Phase 2/3
 * additions to this same interface (see docs/ai.md), not stubbed here.
 */
export interface AIProvider {
  analyzeTender(input: AnalyzeTenderInput): Promise<TenderAnalysis>;
  generateBidRecommendation(input: GenerateBidRecommendationInput): Promise<BidRecommendation>;
}
