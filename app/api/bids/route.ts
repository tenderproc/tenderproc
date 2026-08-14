import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { tenderId } = await req.json();
  if (typeof tenderId !== "string" || !tenderId) {
    return NextResponse.json({ error: "Missing tenderId." }, { status: 400 });
  }

  const { data: tender } = await supabase
    .from("tenders")
    .select("id, status")
    .eq("id", tenderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tender) {
    return NextResponse.json({ error: "Tender not found." }, { status: 404 });
  }

  // Idempotent: if a bid already exists for this tender, just return it
  // rather than erroring on the unique constraint.
  const { data: existing } = await supabase
    .from("bids")
    .select("id")
    .eq("tender_id", tenderId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ id: existing.id });
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

  return NextResponse.json({ id: bid.id });
}
