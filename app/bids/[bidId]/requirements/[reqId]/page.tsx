import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import RequirementWorkspace from "@/components/bids/RequirementWorkspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RequirementPage({
  params,
}: {
  params: Promise<{ bidId: string; reqId: string }>;
}) {
  const { bidId, reqId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bids/${bidId}/requirements/${reqId}`);

  const { data: bid } = await supabase
    .from("bids")
    .select("id")
    .eq("id", bidId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!bid) notFound();

  const { data: requirement } = await supabase
    .from("bid_requirements")
    .select("id, title, description, category, mandatory, status, source_document, source_page, source_section")
    .eq("id", reqId)
    .eq("bid_id", bidId)
    .maybeSingle();
  if (!requirement) notFound();

  const { data: response } = await supabase
    .from("bid_responses")
    .select("id, draft_text, confidence, accepted")
    .eq("bid_requirement_id", reqId)
    .maybeSingle();

  let evidence: { type: string; id: string; label: string }[] = [];
  let warnings: { id: string; message: string }[] = [];
  if (response) {
    const [{ data: evidenceRows }, { data: warningRows }] = await Promise.all([
      supabase
        .from("bid_evidence")
        .select("evidence_type, source_id, label")
        .eq("bid_response_id", response.id),
      supabase
        .from("bid_warnings")
        .select("id, message")
        .eq("bid_response_id", response.id)
        .eq("type", "unsupported_claim")
        .eq("status", "OPEN"),
    ]);
    evidence = (evidenceRows ?? []).map((e) => ({ type: e.evidence_type, id: e.source_id, label: e.label }));
    warnings = warningRows ?? [];
  }

  return (
    <div>
      <Header />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link href={`/bids/${bidId}`} className="text-sm text-inkDim hover:text-ink">
          ← Back to bid workspace
        </Link>

        <div className="mt-6 mb-8">
          <p className="text-xs font-medium uppercase tracking-wide text-inkDim">
            {requirement.category.replace(/_/g, " ")}
            {requirement.mandatory ? " · Mandatory" : ""}
          </p>
          <h1 className="font-display font-bold text-2xl text-ink mt-1 leading-tight tracking-tight">
            {requirement.title}
          </h1>
          {requirement.description && (
            <p className="text-sm text-inkDim mt-2 leading-relaxed">{requirement.description}</p>
          )}
          {(requirement.source_document || requirement.source_page) && (
            <p className="text-xs text-inkDim mt-2">
              Source:{" "}
              {[requirement.source_section, requirement.source_page && `p. ${requirement.source_page}`]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        </div>

        <RequirementWorkspace
          bidId={bidId}
          requirementId={reqId}
          requirementStatus={requirement.status}
          initialResponse={
            response
              ? {
                  id: response.id,
                  draftText: response.draft_text,
                  confidence: response.confidence,
                  accepted: response.accepted,
                }
              : null
          }
          initialEvidence={evidence}
          initialWarnings={warnings}
        />
      </main>
    </div>
  );
}
