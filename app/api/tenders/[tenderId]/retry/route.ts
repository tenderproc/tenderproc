import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processTenderDocument } from "@/lib/tenders/processDocument";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ tenderId: string }> }) {
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
    .select("id, status")
    .eq("id", tenderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tender) {
    return NextResponse.json({ error: "Tender not found.", code: "tenderNotFound" }, { status: 404 });
  }
  if (tender.status !== "FAILED") {
    return NextResponse.json(
      { error: "Only a failed tender can be retried.", code: "notFailed" },
      { status: 400 }
    );
  }

  // The file uploaded to storage survives even when extraction/analysis
  // failed afterward, so a retry can re-run against it without asking the
  // user to re-upload.
  const { data: doc } = await supabase
    .from("tender_documents")
    .select("id, storage_path, file_type, file_name")
    .eq("tender_id", tenderId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json(
      {
        error: "No stored file to retry from. Delete this tender and upload again.",
        code: "noDocumentToRetry",
      },
      { status: 400 }
    );
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("tender-documents")
    .download(doc.storage_path);
  if (downloadError || !fileBlob) {
    return NextResponse.json(
      {
        error: downloadError?.message ?? "Could not re-download the stored file.",
        code: "downloadFailed",
      },
      { status: 500 }
    );
  }
  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  await supabase.from("tenders").update({ status: "PROCESSING" }).eq("id", tenderId);
  await supabase.from("tender_documents").update({ processing_status: "EXTRACTING" }).eq("id", doc.id);

  const result = await processTenderDocument({
    supabase,
    userId: user.id,
    tenderId,
    documentId: doc.id,
    buffer,
    fileType: doc.file_type,
    fileName: doc.file_name,
  });
  if (result.error) {
    return NextResponse.json({ id: tenderId, error: result.error, code: result.code }, { status: 200 });
  }

  return NextResponse.json({ id: tenderId });
}
