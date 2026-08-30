import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import { EvidenceType } from "@/lib/ai/types";
import { getCompanyKnowledge } from "@/lib/company/knowledge";
import { resolveEvidenceList } from "@/lib/company/evidence";
import { FEATURES, getViewerTier, hasFeature } from "@/lib/billing/tiers";

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
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const { tier } = await getViewerTier(supabase, user.id);
  if (!hasFeature(tier, FEATURES.BID_WORKSPACE)) {
    return NextResponse.json(
      { error: "Bid workspace requires a Pro plan. Upgrade to re-check drafts.", code: "bidWorkspaceGated" },
      { status: 402 }
    );
  }

  const { draftText } = await req.json();
  if (typeof draftText !== "string") {
    return NextResponse.json({ error: "Missing draftText.", code: "missingDraftText" }, { status: 400 });
  }

  const { data: response } = await supabase
    .from("bid_responses")
    .select("id")
    .eq("bid_requirement_id", reqId)
    .eq("bid_id", bidId)
    .maybeSingle();
  if (!response) {
    return NextResponse.json({ error: "No draft to re-check yet.", code: "noDraftToRecheck" }, { status: 404 });
  }

  const company = await getCompanyKnowledge(supabase, user.id);
  if (!company) {
    return NextResponse.json({ error: "Company profile not found.", code: "companyProfileNotFound" }, { status: 400 });
  }

  const { data: evidenceRows } = await supabase
    .from("bid_evidence")
    .select("evidence_type, source_id")
    .eq("bid_response_id", response.id);
  const selectedEvidence = resolveEvidenceList(
    company,
    (evidenceRows ?? []).map((e) => ({ type: e.evidence_type as EvidenceType, id: e.source_id }))
  );

  const provider = getAIProvider();
  let validation;
  try {
    validation = await provider.validateResponse({ draftText, evidence: selectedEvidence, company });
  } catch (err) {
    console.error("validateResponse failed", err);
    return NextResponse.json(
      { error: "Could not re-check the draft right now. Try again in a moment.", code: "couldNotRecheckDraft" },
      { status: 500 }
    );
  }

  await supabase
    .from("bid_responses")
    .update({ draft_text: draftText, updated_at: new Date().toISOString() })
    .eq("id", response.id);

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

  return NextResponse.json({ unsupportedClaims: validation.unsupportedClaims });
}
