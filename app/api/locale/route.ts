import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "@/lib/locales";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const locale = body?.locale;
  if (!isLocale(locale)) {
    return NextResponse.json({ error: "Unsupported locale.", code: "unsupported_locale" }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });

  return NextResponse.json({ locale });
}
