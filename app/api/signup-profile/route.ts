import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SECTORS } from "@/lib/sectors";
import { isFreeEmailDomain } from "@/lib/freeEmailDomains";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, email, isFreeTier, companyName, companyNumber, address, sectors, companySize, description } =
    body ?? {};

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }
  const validSectorKeys = new Set(SECTORS.map((s) => s.key));
  const cleanSectors = Array.isArray(sectors)
    ? sectors.filter((s) => typeof s === "string" && validSectorKeys.has(s))
    : [];

  const admin = createAdminClient();

  // Server-side backstop for the free-tier professional-email restriction:
  // the signup form already blocks this client-side, but that's only a UX
  // guard — anyone can call supabase.auth.signUp() directly with a consumer
  // address. Reject here too and tear down the auth user it just created,
  // since there's no session yet to authenticate a self-service deletion.
  if (isFreeTier === true && typeof email === "string" && isFreeEmailDomain(email)) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: "professional_email_required" }, { status: 403 });
  }
  // Insert-only (not upsert): this route runs right after signUp, before the
  // user has a session to authenticate a normal RLS-protected write, so it's
  // reachable with just a user id. Restricting it to a one-time insert means
  // it can seed a fresh profile but never overwrite one that already exists.
  const { error } = await admin.from("profiles").insert({
    id: userId,
    company_name: typeof companyName === "string" ? companyName.slice(0, 200) : "",
    company_number: typeof companyNumber === "string" ? companyNumber.slice(0, 20) : null,
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
