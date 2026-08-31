import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SECTORS } from "@/lib/sectors";
import { isFreeEmailDomain } from "@/lib/freeEmailDomains";
import { stripHtmlTags } from "@/lib/sanitize";

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
  // stripHtmlTags: defense-in-depth against script-tag payloads — see
  // supabase-company-text-sanitization-migration.sql, which found and
  // cleaned up a live XSS probe stored via this exact route. This is the
  // only writer of profiles.company_description/address in the codebase,
  // so it's the one place that needs the app-code version of the same
  // sanitization the companies-table trigger applies at the DB level.
  const cleanCompanyName = typeof companyName === "string" ? stripHtmlTags(companyName.trim()).slice(0, 200) : "";
  const cleanAddress = typeof address === "string" ? stripHtmlTags(address.trim()).slice(0, 300) : "";
  const cleanCompanySize = typeof companySize === "string" ? stripHtmlTags(companySize.trim()).slice(0, 50) : "";
  const cleanDescription = typeof description === "string" ? stripHtmlTags(description.trim()).slice(0, 2000) : "";

  const { error } = await admin.from("profiles").insert({
    id: userId,
    company_name: cleanCompanyName,
    company_number: typeof companyNumber === "string" ? companyNumber.slice(0, 20) : null,
    address: cleanAddress,
    sectors: cleanSectors,
    company_size: cleanCompanySize,
    company_description: cleanDescription,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Also seed `companies` — the richer profile that drives AI matching
  // (see lib/companyProfile.ts) as well as /company's knowledge base.
  // `companies.name` is NOT NULL, unlike profiles.company_name, so this
  // needs a non-empty fallback even though the signup form doesn't
  // strictly require a company name. Best-effort: a signup should never
  // fail because this second insert had trouble, since `profiles` above
  // already succeeded and the app is usable without it (the /company page
  // fallback-blends from `profiles` if this row is ever missing).
  const { error: companyError } = await admin.from("companies").insert({
    user_id: userId,
    name: cleanCompanyName || (typeof email === "string" ? email.split("@")[0] : "New company"),
    description: cleanDescription || null,
    company_size: cleanCompanySize || null,
    sector_keys: cleanSectors,
    regions_served: cleanAddress ? [cleanAddress] : [],
  });
  if (companyError) {
    console.error("signup-profile: failed to seed companies row (non-fatal)", companyError);
  }

  return NextResponse.json({ ok: true });
}
