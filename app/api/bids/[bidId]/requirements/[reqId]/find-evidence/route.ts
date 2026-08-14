import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import { getCompanyKnowledge } from "@/lib/company/knowledge";

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

  const { data: requirement } = await supabase
    .from("bid_requirements")
    .select("title, description, category, mandatory")
    .eq("id", reqId)
    .eq("bid_id", bidId)
    .maybeSingle();
  if (!requirement) {
    return NextResponse.json({ error: "Requirement not found." }, { status: 404 });
  }

  const company = await getCompanyKnowledge(supabase, user.id);
  if (!company) {
    return NextResponse.json({ matches: [] });
  }

  const provider = getAIProvider();
  try {
    const matches = await provider.findCompanyEvidence({
      requirement: {
        title: requirement.title,
        description: requirement.description,
        category: requirement.category,
        mandatory: requirement.mandatory,
      },
      company,
    });
    return NextResponse.json({ matches });
  } catch (err) {
    console.error("findCompanyEvidence failed", err);
    return NextResponse.json(
      { error: "Could not find evidence right now. Try again in a moment." },
      { status: 500 }
    );
  }
}
