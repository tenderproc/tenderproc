import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Backs the signup company-name autocomplete (CompanySearchInput). Reads
// kbo_companies, a table of Belgian KBO Open Data imported by
// scripts/import-kbo-companies.ts — see docs/database.md.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("search_kbo_companies", {
    search_query: q.slice(0, 100),
    result_limit: 8,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = (data ?? []).map((row: { enterprise_number: string; denomination: string; start_date: string | null }) => ({
    enterpriseNumber: row.enterprise_number,
    denomination: row.denomination,
    startDate: row.start_date,
  }));
  return NextResponse.json({ results });
}
