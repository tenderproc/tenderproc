import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import { EvidenceType } from "@/lib/ai/types";
import { getCompanyKnowledge } from "@/lib/company/knowledge";
import { resolveEvidenceList } from "@/lib/company/evidence";

const EVIDENCE_TYPES: EvidenceType[] = ["service", "certification", "reference"];

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ bidId: string; reqId: string }> }
) {
  const { bidId, reqId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json();
  const requestedEvidence: { type: EvidenceType; id: string }[] = Array.isArray(body?.evidence)
    ? body.evidence.filter(
        (e: unknown): e is { type: EvidenceType; id: string } =>
          typeof (e as { id?: unknown })?.id === "string" &&
          EVIDENCE_TYPES.includes((e as { type?: unknown })?.type as EvidenceType)
      )
    : [];

  const { data: requirement } = await supabase
    .from("bid_requirements")
    .select("id, title, description, category, mandatory, status")
    .eq("id", reqId)
    .eq("bid_id", bidId)
    .maybeSingle();
  if (!requirement) {
    return NextResponse.json({ error: "Requirement not found." }, { status: 404 });
  }

  const { data: bid } = await supabase
    .from("bids")
    .select("id, tender_id")
    .eq("id", bidId)
    .maybeSingle();
  if (!bid) {
    return NextResponse.json({ error: "Bid not found." }, { status: 404 });
  }

  const { data: tender } = await supabase
    .from("tenders")
    .select("title, contracting_authority")
    .eq("id", bid.tender_id)
    .maybeSingle();

  const company = await getCompanyKnowledge(supabase, user.id);
  if (!company) {
    return NextResponse.json(
      { error: "Add your company profile before generating a draft." },
      { status: 400 }
    );
  }

  const selectedEvidence = resolveEvidenceList(company, requestedEvidence);

  const provider = getAIProvider();
  let draft, validation;
  try {
    draft = await provider.generateResponseDraft({
      requirement: {
        title: requirement.title,
        description: requirement.description,
        category: requirement.category,
        mandatory: requirement.mandatory,
      },
      tenderTitle: tender?.title ?? null,
      contractingAuthority: tender?.contracting_authority ?? null,
      awardCriterion: null,
      evidence: selectedEvidence,
      company,
    });

    validation = await provider.validateResponse({
      draftText: draft.draft,
      evidence: selectedEvidence,
      company,
    });
  } catch (err) {
    console.error("generateResponseDraft/validateResponse failed", err);
    return NextResponse.json(
      { error: "Could not generate a draft right now. Try again in a moment." },
      { status: 500 }
    );
  }

  const { data: response, error: respError } = await supabase
    .from("bid_responses")
    .upsert(
      {
        bid_id: bidId,
        bid_requirement_id: reqId,
        draft_text: draft.draft,
        confidence: draft.confidence,
        accepted: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "bid_requirement_id" }
    )
    .select("id")
    .single();
  if (respError || !response) {
    return NextResponse.json(
      { error: respError?.message ?? "Could not save the draft." },
      { status: 500 }
    );
  }

  await supabase.from("bid_evidence").delete().eq("bid_response_id", response.id);
  if (selectedEvidence.length > 0) {
    await supabase.from("bid_evidence").insert(
      selectedEvidence.map((e) => ({
        bid_response_id: response.id,
        evidence_type: e.type,
        source_id: e.id,
        label: e.label,
      }))
    );
  }

  await supabase
    .from("bid_warnings")
    .delete()
    .eq("bid_response_id", response.id)
    .eq("type", "unsupported_claim");
  if (validation.unsupportedClaims.length > 0) {
    await supabase.from("bid_warnings").insert(
      validation.unsupportedClaims.map((claim) => ({
        bid_id: bidId,
        bid_response_id: response.id,
        type: "unsupported_claim",
        message: claim,
      }))
    );
  }

  if (requirement.status === "NOT_STARTED") {
    await supabase
      .from("bid_requirements")
      .update({ status: "IN_PROGRESS", updated_at: new Date().toISOString() })
      .eq("id", reqId);
  }

  return NextResponse.json({
    responseId: response.id,
    draft: draft.draft,
    confidence: draft.confidence,
    warnings: draft.warnings,
    unsupportedClaims: validation.unsupportedClaims,
    evidence: selectedEvidence,
  });
}
