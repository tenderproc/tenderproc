import { createClient } from "@/lib/supabase/server";
import { getExtractor } from "@/lib/documents/extractor";
import { getAIProvider } from "@/lib/ai";
import { getCompanyKnowledge } from "@/lib/company/knowledge";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface ProcessTenderDocumentResult {
  error?: string;
  code?: string;
}

/**
 * Runs extraction + AI analysis for an already-uploaded tender document and
 * writes the results onto the given tender row. Shared by the initial
 * upload route and the retry route so a failed analysis can be re-run
 * against the file already in storage, without re-uploading.
 */
export async function processTenderDocument({
  supabase,
  userId,
  tenderId,
  documentId,
  buffer,
  fileType,
  fileName,
}: {
  supabase: SupabaseServerClient;
  userId: string;
  tenderId: string;
  documentId: string;
  buffer: Buffer;
  fileType: string;
  fileName: string;
}): Promise<ProcessTenderDocumentResult> {
  let extractedText: string;
  try {
    const extractor = getExtractor(fileType);
    const extracted = await extractor.extractText(buffer);
    extractedText = extracted.text;
    await supabase
      .from("tender_documents")
      .update({ extracted_text: extractedText, processing_status: "DONE" })
      .eq("id", documentId);
  } catch (err) {
    await supabase
      .from("tender_documents")
      .update({ processing_status: "FAILED" })
      .eq("id", documentId);
    await supabase.from("tenders").update({ status: "FAILED" }).eq("id", tenderId);
    return { error: err instanceof Error ? err.message : "Text extraction failed." };
  }

  await supabase.from("tenders").update({ status: "ANALYZING" }).eq("id", tenderId);

  const provider = getAIProvider();
  let analysis;
  try {
    analysis = await provider.analyzeTender({ documentText: extractedText, fileName });
  } catch (err) {
    console.error("analyzeTender failed", err);
    await supabase.from("tenders").update({ status: "FAILED" }).eq("id", tenderId);
    return { error: "AI analysis failed. Try again in a moment.", code: "aiAnalysisFailed" };
  }

  await supabase
    .from("tenders")
    .update({
      title: analysis.contract.title,
      contracting_authority: analysis.contract.contractingAuthority,
      reference_number: analysis.contract.referenceNumber,
      location: analysis.contract.location,
      estimated_value: analysis.contract.estimatedValue,
      currency: analysis.contract.currency ?? "EUR",
      publication_date: analysis.contract.publicationDate,
      submission_deadline: analysis.contract.submissionDeadline,
      contract_duration: analysis.contract.contractDuration,
      description: analysis.summary,
      ai_summary: analysis.summary,
      ai_analysis: {
        requiredDocuments: analysis.requiredDocuments,
        risks: analysis.risks,
        ambiguities: analysis.ambiguities,
      },
    })
    .eq("id", tenderId);

  // Clear out anything from a previous attempt (e.g. a retry after a
  // partial failure) so re-inserting below doesn't create duplicates.
  await supabase.from("tender_requirements").delete().eq("tender_id", tenderId);
  await supabase.from("tender_award_criteria").delete().eq("tender_id", tenderId);

  if (analysis.requirements.length > 0) {
    await supabase.from("tender_requirements").insert(
      analysis.requirements.map((r) => ({
        tender_id: tenderId,
        title: r.title,
        description: r.description,
        category: r.category,
        mandatory: r.mandatory,
        source_page: r.sourcePage,
        source_section: r.sourceSection,
        source_document: fileName,
      }))
    );
  }
  if (analysis.awardCriteria.length > 0) {
    await supabase.from("tender_award_criteria").insert(
      analysis.awardCriteria.map((c) => ({
        tender_id: tenderId,
        criterion: c.criterion,
        weight: c.weight,
        description: c.description,
      }))
    );
  }

  // Bid/No-Bid needs a company knowledge base — skip gracefully if the user
  // hasn't built one yet rather than calling the AI with nothing to work from.
  const company = await getCompanyKnowledge(supabase, userId);
  if (company) {
    try {
      const recommendation = await provider.generateBidRecommendation({
        tenderAnalysis: analysis,
        requirements: analysis.requirements,
        company,
      });
      await supabase
        .from("tenders")
        .update({
          ai_match_score: recommendation.score,
          ai_match_label: recommendation.matchLabel,
          ai_recommendation: recommendation.recommendation,
          ai_recommendation_confidence: recommendation.confidence,
          ai_scorecard_dimensions: recommendation.dimensions,
          ai_disqualifiers: recommendation.disqualifyingFactors,
          ai_analysis: {
            requiredDocuments: analysis.requiredDocuments,
            risks: analysis.risks,
            ambiguities: analysis.ambiguities,
            positiveFactors: recommendation.positiveFactors,
            recommendationRisks: recommendation.risks,
            missingRequirements: recommendation.missingRequirements,
            estimatedEffortHours: recommendation.estimatedEffortHours,
          },
        })
        .eq("id", tenderId);
    } catch (err) {
      console.error("generateBidRecommendation failed", err);
      // Analysis itself succeeded — don't fail the whole run over this.
    }
  }

  await supabase.from("tenders").update({ status: "READY" }).eq("id", tenderId);

  return {};
}
