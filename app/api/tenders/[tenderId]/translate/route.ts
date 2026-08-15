import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider } from "@/lib/ai";
import { isLocale, LOCALE_ENGLISH_NAME, type Locale } from "@/lib/locales";
import { extractTranslatableTenderFields } from "@/lib/tenders/translation";

const TRANSLATABLE_LOCALES = new Set<Locale>(["nl", "fr", "de"]);

export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ tenderId: string }> }) {
  const { tenderId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const locale = body?.locale;
  if (!isLocale(locale) || !TRANSLATABLE_LOCALES.has(locale)) {
    return NextResponse.json({ error: "Invalid locale.", code: "invalidLocale" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const { data: tender } = await supabase
    .from("tenders")
    .select("id, ai_summary, ai_analysis, ai_scorecard_dimensions, ai_disqualifiers")
    .eq("id", tenderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tender) {
    return NextResponse.json({ error: "Tender not found.", code: "tenderNotFound" }, { status: 404 });
  }

  const [{ data: requirements }, { data: awardCriteria }] = await Promise.all([
    supabase.from("tender_requirements").select("id, title, description").eq("tender_id", tenderId),
    supabase.from("tender_award_criteria").select("id, criterion, description").eq("tender_id", tenderId),
  ]);

  const requirementIds = (requirements ?? []).map((r) => r.id);
  const { data: evidence } =
    requirementIds.length > 0
      ? await supabase
          .from("tender_requirement_evidence")
          .select("tender_requirement_id, notes")
          .in("tender_requirement_id", requirementIds)
      : { data: [] as { tender_requirement_id: string; notes: string | null }[] };

  const fields = extractTranslatableTenderFields({
    aiSummary: tender.ai_summary,
    aiAnalysis: tender.ai_analysis,
    scoreDimensions: tender.ai_scorecard_dimensions ?? [],
    disqualifyingFactors: tender.ai_disqualifiers ?? [],
    requirements: requirements ?? [],
    awardCriteria: awardCriteria ?? [],
    evidenceNotes: (evidence ?? []).map((e) => ({
      requirementId: e.tender_requirement_id,
      notes: e.notes ?? "",
    })),
  });

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ fields: {} });
  }

  const provider = getAIProvider();
  let translated: Record<string, string>;
  try {
    translated = await provider.translateFields({ fields, targetLanguage: LOCALE_ENGLISH_NAME[locale] });
  } catch (err) {
    console.error("translateFields failed", err);
    return NextResponse.json(
      { error: "Could not translate this tender right now. Try again in a moment.", code: "couldNotTranslate" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  await admin.from("content_translations").upsert(
    {
      source_table: "tenders",
      source_id: tenderId,
      locale,
      fields: translated,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_table,source_id,locale" }
  );

  return NextResponse.json({ fields: translated });
}
