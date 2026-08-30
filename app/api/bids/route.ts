import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FEATURES, getViewerTier, hasFeature } from "@/lib/billing/tiers";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const { tenderId } = await req.json();
  if (typeof tenderId !== "string" || !tenderId) {
    return NextResponse.json({ error: "Missing tenderId.", code: "missingTenderId" }, { status: 400 });
  }

  const { data: tender } = await supabase
    .from("tenders")
    .select("id, status, ai_analysis")
    .eq("id", tenderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tender) {
    return NextResponse.json({ error: "Tender not found.", code: "tenderNotFound" }, { status: 404 });
  }

  // Idempotent: if a bid already exists for this tender, just return it
  // rather than erroring on the unique constraint. Checked before the tier
  // gate below so a Free user who downgraded after starting this bid can
  // still get back into it — only *starting a new one* is gated.
  const { data: existing } = await supabase
    .from("bids")
    .select("id")
    .eq("tender_id", tenderId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ id: existing.id });
  }

  const { tier } = await getViewerTier(supabase, user.id);
  if (!hasFeature(tier, FEATURES.BID_WORKSPACE)) {
    return NextResponse.json(
      { error: "Bid workspace requires a Pro plan. Upgrade to start preparing bids.", code: "bidWorkspaceGated" },
      { status: 402 }
    );
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: bid, error: bidError } = await supabase
    .from("bids")
    .insert({ user_id: user.id, tender_id: tenderId, company_id: company?.id ?? null })
    .select("id")
    .single();
  if (bidError || !bid) {
    return NextResponse.json({ error: bidError?.message ?? "Could not create bid." }, { status: 500 });
  }

  const { data: requirements } = await supabase
    .from("tender_requirements")
    .select("id, title, description, category, mandatory, source_document, source_page, source_section")
    .eq("tender_id", tenderId);

  if (requirements && requirements.length > 0) {
    await supabase.from("bid_requirements").insert(
      requirements.map((r) => ({
        bid_id: bid.id,
        tender_requirement_id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        mandatory: r.mandatory,
        source_document: r.source_document,
        source_page: r.source_page,
        source_section: r.source_section,
      }))
    );
  }

  // requiredDocuments only lives in the tender's ai_analysis jsonb blob
  // (never normalized into its own table) — snapshot it into row-per-item
  // bid_documents here, the same way tender_requirements is snapshotted
  // into bid_requirements above, so each can be tracked/uploaded individually.
  const requiredDocuments: unknown = (tender.ai_analysis as { requiredDocuments?: unknown })
    ?.requiredDocuments;
  if (Array.isArray(requiredDocuments) && requiredDocuments.length > 0) {
    const names = requiredDocuments.filter(
      (d): d is string => typeof d === "string" && d.trim().length > 0
    );
    if (names.length > 0) {
      await supabase.from("bid_documents").insert(names.map((name) => ({ bid_id: bid.id, name })));
    }
  }

  return NextResponse.json({ id: bid.id });
}
