import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import { getCompanyKnowledge } from "@/lib/company/knowledge";

export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ tenderId: string }> }) {
  const { tenderId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const { data: tender } = await supabase
    .from("tenders")
    .select("id")
    .eq("id", tenderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tender) {
    return NextResponse.json({ error: "Tender not found.", code: "tenderNotFound" }, { status: 404 });
  }

  const { data: requirements } = await supabase
    .from("tender_requirements")
    .select("id, title, description, category, mandatory")
    .eq("tender_id", tenderId);
  if (!requirements || requirements.length === 0) {
    return NextResponse.json({ mappings: [] });
  }

  const company = await getCompanyKnowledge(supabase, user.id);
  if (!company) {
    return NextResponse.json(
      { error: "Add your company profile before mapping evidence.", code: "needCompanyProfile" },
      { status: 400 }
    );
  }

  const provider = getAIProvider();
  let result;
  try {
    result = await provider.mapRequirementsToEvidence({ requirements, company });
  } catch (err) {
    console.error("mapRequirementsToEvidence failed", err);
    return NextResponse.json(
      { error: "Could not map evidence right now. Try again in a moment.", code: "couldNotMapEvidence" },
      { status: 500 }
    );
  }

  for (const mapping of result.mappings) {
    const { data: evidenceRow, error: upsertError } = await supabase
      .from("tender_requirement_evidence")
      .upsert(
        {
          tender_requirement_id: mapping.requirementId,
          status: mapping.status,
          confidence: mapping.confidence,
          notes: mapping.notes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tender_requirement_id" }
      )
      .select("id")
      .single();
    if (upsertError || !evidenceRow) continue;

    await supabase
      .from("tender_requirement_evidence_items")
      .delete()
      .eq("tender_requirement_evidence_id", evidenceRow.id);

    if (mapping.evidence.length > 0) {
      await supabase.from("tender_requirement_evidence_items").insert(
        mapping.evidence.map((e) => ({
          tender_requirement_evidence_id: evidenceRow.id,
          tender_requirement_id: mapping.requirementId,
          evidence_type: e.type,
          evidence_id: e.id,
          label: e.label,
        }))
      );
    }
  }

  return NextResponse.json(result);
}
