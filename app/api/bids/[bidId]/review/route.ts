import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import { getCompanyKnowledge } from "@/lib/company/knowledge";
import { RequirementCategory } from "@/lib/ai/types";

const WARNING_PENALTY = 3;

export async function POST(req: NextRequest, ctx: { params: Promise<{ bidId: string }> }) {
  const { bidId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const { data: bid } = await supabase
    .from("bids")
    .select("id")
    .eq("id", bidId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!bid) {
    return NextResponse.json({ error: "Bid not found.", code: "bidNotFound" }, { status: 404 });
  }

  const [{ data: requirements }, { data: documents }, { data: openClaims }, { data: responses }] =
    await Promise.all([
      supabase.from("bid_requirements").select("title, category, mandatory, status").eq("bid_id", bidId),
      supabase.from("bid_documents").select("name, status").eq("bid_id", bidId),
      supabase
        .from("bid_warnings")
        .select("id")
        .eq("bid_id", bidId)
        .eq("type", "unsupported_claim")
        .eq("status", "OPEN"),
      supabase
        .from("bid_responses")
        .select("draft_text, bid_requirement:bid_requirements(title, category)")
        .eq("bid_id", bidId),
    ]);

  const allRequirements = requirements ?? [];
  const allDocuments = documents ?? [];
  const unsupportedClaimsOpen = (openClaims ?? []).length;

  const requirementsTotal = allRequirements.length;
  const requirementsComplete = allRequirements.filter(
    (r) => r.status === "COMPLETE" || r.status === "NOT_APPLICABLE"
  ).length;
  const documentsTotal = allDocuments.length;
  const documentsReady = allDocuments.filter((d) => d.status === "READY").length;

  const criticalIssues: string[] = [];
  for (const r of allRequirements) {
    if (r.mandatory && r.status !== "COMPLETE" && r.status !== "NOT_APPLICABLE") {
      criticalIssues.push(`Mandatory requirement not complete: ${r.title}`);
    }
  }
  for (const d of allDocuments) {
    if (d.status !== "READY") {
      criticalIssues.push(`Required document missing: ${d.name}`);
    }
  }

  const warnings: string[] = [];
  for (const r of allRequirements) {
    if (!r.mandatory && r.status !== "COMPLETE" && r.status !== "NOT_APPLICABLE") {
      warnings.push(`Optional requirement not yet answered: ${r.title}`);
    }
  }
  if (unsupportedClaimsOpen > 0) {
    warnings.push(
      `${unsupportedClaimsOpen} unresolved unsupported claim${unsupportedClaimsOpen === 1 ? "" : "s"} in drafted responses`
    );
  }

  const company = await getCompanyKnowledge(supabase, user.id);
  const draftedResponses = (
    (responses ?? []) as unknown as {
      draft_text: string;
      bid_requirement: { title: string; category: RequirementCategory } | null;
    }[]
  )
    .filter((r) => r.bid_requirement && r.draft_text)
    .map((r) => ({
      requirementTitle: r.bid_requirement!.title,
      category: r.bid_requirement!.category,
      draftText: r.draft_text,
    }));

  if (company && draftedResponses.length > 0) {
    try {
      const provider = getAIProvider();
      const result = await provider.runComplianceReview({ responses: draftedResponses, company });
      warnings.push(...result.inconsistencies);
    } catch (err) {
      console.error("runComplianceReview failed", err);
      // Non-fatal: the deterministic parts of the review are still useful
      // even if the AI consistency pass couldn't run this time.
    }
  }

  const total = requirementsTotal + documentsTotal;
  const passed = requirementsComplete + documentsReady;
  const rawScore = total > 0 ? (passed / total) * 100 : 0;
  const complianceScore = Math.max(0, Math.round(rawScore - warnings.length * WARNING_PENALTY));
  const readyToSubmit = criticalIssues.length === 0;

  const { data: review, error: reviewError } = await supabase
    .from("bid_reviews")
    .insert({
      bid_id: bidId,
      compliance_score: complianceScore,
      ready_to_submit: readyToSubmit,
      critical_issues: criticalIssues,
      warnings,
      requirements_total: requirementsTotal,
      requirements_complete: requirementsComplete,
      documents_total: documentsTotal,
      documents_ready: documentsReady,
      unsupported_claims_open: unsupportedClaimsOpen,
    })
    .select(
      "id, compliance_score, ready_to_submit, critical_issues, warnings, requirements_total, requirements_complete, documents_total, documents_ready, unsupported_claims_open, created_at"
    )
    .single();
  if (reviewError || !review) {
    return NextResponse.json(
      { error: reviewError?.message ?? "Could not save the review." },
      { status: 500 }
    );
  }

  return NextResponse.json({ review });
}
