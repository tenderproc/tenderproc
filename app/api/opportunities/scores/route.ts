import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSavedCompanyProfile } from "@/lib/companyProfile";
import { getMatchScores } from "@/lib/matchScoreCache";
import { hasProfileSignal } from "@/lib/scoring";
import { TenderNotice } from "@/lib/types";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locales";

// Split out from the Opportunities page render (see app/opportunities/page.tsx)
// so a batch of uncached AI match scores never blocks the tender list from
// appearing — the page renders tenders immediately and this route is called
// client-side afterward to fill in scores as they become available.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const body = await req.json();
  const tenders: TenderNotice[] = Array.isArray(body?.tenders) ? body.tenders : [];
  if (tenders.length === 0) {
    return NextResponse.json({ scores: {} });
  }
  const locale = isLocale(body?.locale) ? body.locale : DEFAULT_LOCALE;

  const { profile } = await getSavedCompanyProfile(supabase, user.id);
  if (!hasProfileSignal(profile)) {
    return NextResponse.json({ scores: {} });
  }

  const scores = await getMatchScores(supabase, user.id, tenders, profile, locale);
  return NextResponse.json({ scores });
}
