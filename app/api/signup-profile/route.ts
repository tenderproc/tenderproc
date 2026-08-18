import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SECTORS } from "@/lib/sectors";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, companyName, address, sectors, companySize, description } = body ?? {};

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  const validSectorKeys = new Set(SECTORS.map((s) => s.key));
  const cleanSectors = Array.isArray(sectors)
    ? sectors.filter((s) => typeof s === "string" && validSectorKeys.has(s))
    : [];

  const admin = createAdminClient();
  // Insert-only (not upsert): this route runs right after signUp, before the
  // user has a session to authenticate a normal RLS-protected write, so it's
  // reachable with just a user id. Restricting it to a one-time insert means
  // it can seed a fresh profile but never overwrite one that already exists.
  const { error } = await admin.from("profiles").insert({
    id: userId,
    company_name: typeof companyName === "string" ? companyName.slice(0, 200) : "",
    address: typeof address === "string" ? address.slice(0, 300) : "",
    sectors: cleanSectors,
    company_size: typeof companySize === "string" ? companySize.slice(0, 50) : "",
    company_description: typeof description === "string" ? description.slice(0, 2000) : "",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
