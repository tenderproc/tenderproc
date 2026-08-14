import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getExtractor, isSupportedMimeType } from "@/lib/documents/extractor";
import { getAIProvider } from "@/lib/ai";
import { getCompanyKnowledge } from "@/lib/company/knowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!isSupportedMimeType(file.type)) {
    return NextResponse.json(
      { error: "Only PDF files are supported in this beta." },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is larger than 20MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Create the tender row up front (status PROCESSING) so the client can
  // navigate to its detail page immediately and see status progress there,
  // regardless of how the rest of this request turns out.
  const { data: tender, error: tenderError } = await supabase
    .from("tenders")
    .insert({ user_id: user.id, status: "PROCESSING" })
    .select("id")
    .single();
  if (tenderError || !tender) {
    return NextResponse.json(
      { error: tenderError?.message ?? "Could not create tender record." },
      { status: 500 }
    );
  }
  const tenderId = tender.id as string;

  const storagePath = `${user.id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("tender-documents")
    .upload(storagePath, buffer, { contentType: file.type });
  if (uploadError) {
    await supabase.from("tenders").update({ status: "FAILED" }).eq("id", tenderId);
    return NextResponse.json({ id: tenderId, error: uploadError.message }, { status: 500 });
  }

  const { data: doc, error: docError } = await supabase
    .from("tender_documents")
    .insert({
      tender_id: tenderId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: file.type,
      file_size_bytes: file.size,
      processing_status: "EXTRACTING",
    })
    .select("id")
    .single();
  if (docError || !doc) {
    await supabase.from("tenders").update({ status: "FAILED" }).eq("id", tenderId);
    return NextResponse.json({ id: tenderId, error: docError?.message }, { status: 500 });
  }

  let extractedText: string;
  try {
    const extractor = getExtractor(file.type);
    const extracted = await extractor.extractText(buffer);
    extractedText = extracted.text;
    await supabase
      .from("tender_documents")
      .update({ extracted_text: extractedText, processing_status: "DONE" })
      .eq("id", doc.id);
  } catch (err) {
    await supabase
      .from("tender_documents")
      .update({ processing_status: "FAILED" })
      .eq("id", doc.id);
    await supabase.from("tenders").update({ status: "FAILED" }).eq("id", tenderId);
    return NextResponse.json(
      { id: tenderId, error: err instanceof Error ? err.message : "Text extraction failed." },
      { status: 200 }
    );
  }

  await supabase.from("tenders").update({ status: "ANALYZING" }).eq("id", tenderId);

  const provider = getAIProvider();
  let analysis;
  try {
    analysis = await provider.analyzeTender({ documentText: extractedText, fileName: file.name });
  } catch (err) {
    console.error("analyzeTender failed", err);
    await supabase.from("tenders").update({ status: "FAILED" }).eq("id", tenderId);
    return NextResponse.json(
      { id: tenderId, error: "AI analysis failed. Try again in a moment." },
      { status: 200 }
    );
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
        source_document: file.name,
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
  const company = await getCompanyKnowledge(supabase, user.id);
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
      // Analysis itself succeeded — don't fail the whole upload over this.
    }
  }

  await supabase.from("tenders").update({ status: "READY" }).eq("id", tenderId);

  return NextResponse.json({ id: tenderId });
}
