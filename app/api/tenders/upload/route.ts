import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupportedMimeType } from "@/lib/documents/extractor";
import { processTenderDocument } from "@/lib/tenders/processDocument";
import { incrementUploadCount, peekUploadQuota } from "@/lib/billing/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const quota = await peekUploadQuota(user.id);
  if (!quota.unlimited && quota.used >= quota.limit) {
    return NextResponse.json(
      { error: "You've used all your free tender analyses this month. Upgrade for unlimited use.", code: "uploadQuotaExceeded" },
      { status: 402 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided.", code: "noFileProvided" }, { status: 400 });
  }
  if (!isSupportedMimeType(file.type)) {
    return NextResponse.json(
      { error: "Only PDF files are supported in this beta.", code: "onlyPdfSupported" },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is larger than 20MB.", code: "fileTooLarge" }, { status: 400 });
  }

  const confirmDuplicate = formData.get("confirmDuplicate") === "true";
  if (!confirmDuplicate) {
    // Same file name + size previously uploaded by this user (RLS on
    // tender_documents already scopes this query to their own rows — see
    // the "manage own tender documents" policy in
    // supabase-phase1-migration.sql). A soft warning, not a hard block: a
    // legitimately re-issued tender can share a filename with an old one.
    const { data: existingDoc } = await supabase
      .from("tender_documents")
      .select("file_name, uploaded_at, tenders(title, status)")
      .eq("file_name", file.name)
      .eq("file_size_bytes", file.size)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingDoc) {
      const existingTender = Array.isArray(existingDoc.tenders)
        ? existingDoc.tenders[0]
        : existingDoc.tenders;
      return NextResponse.json({
        duplicate: true,
        existingTitle: existingTender?.title ?? null,
        existingStatus: existingTender?.status ?? null,
        existingUploadedAt: existingDoc.uploaded_at,
      });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Create the tender row up front (status PROCESSING) so the client can
  // navigate to its detail page immediately and see status progress there,
  // regardless of how the rest of this request turns out.
  const { data: tender, error: tenderError } = await supabase
    .from("tenders")
    .insert({ user_id: user.id, status: "PROCESSING" })
    .select("id")
    .single();
  if (tenderError || !tender) {
    return NextResponse.json(
      { error: tenderError?.message ?? "Could not create tender record." },
      { status: 500 }
    );
  }
  const tenderId = tender.id as string;

  const storagePath = `${user.id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("tender-documents")
    .upload(storagePath, buffer, { contentType: file.type });
  if (uploadError) {
    await supabase.from("tenders").update({ status: "FAILED" }).eq("id", tenderId);
    return NextResponse.json({ id: tenderId, error: uploadError.message }, { status: 500 });
  }

  const { data: doc, error: docError } = await supabase
    .from("tender_documents")
    .insert({
      tender_id: tenderId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: file.type,
      file_size_bytes: file.size,
      processing_status: "EXTRACTING",
    })
    .select("id")
    .single();
  if (docError || !doc) {
    await supabase.from("tenders").update({ status: "FAILED" }).eq("id", tenderId);
    return NextResponse.json({ id: tenderId, error: docError?.message }, { status: 500 });
  }

  const result = await processTenderDocument({
    supabase,
    userId: user.id,
    tenderId,
    documentId: doc.id,
    buffer,
    fileType: file.type,
    fileName: file.name,
  });
  if (result.error) {
    return NextResponse.json({ id: tenderId, error: result.error, code: result.code }, { status: 200 });
  }

  if (!quota.unlimited) await incrementUploadCount(user.id);

  return NextResponse.json({ id: tenderId });
}
