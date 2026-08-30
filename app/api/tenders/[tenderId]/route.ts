import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ tenderId: string }> }) {
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

  // Grab storage paths before the row (and its cascaded tender_documents
  // rows) disappear — deleting the DB row doesn't delete the storage object.
  const { data: documents } = await supabase
    .from("tender_documents")
    .select("storage_path")
    .eq("tender_id", tenderId);

  const { error } = await supabase.from("tenders").delete().eq("id", tenderId).eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message, code: "deleteFailed" }, { status: 500 });
  }

  const paths = (documents ?? []).map((d) => d.storage_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from("tender-documents").remove(paths);
  }

  return NextResponse.json({ ok: true });
}
