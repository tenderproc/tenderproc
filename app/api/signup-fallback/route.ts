import { NextRequest, NextResponse } from "next/server";

// The signup <form> in app/signup/page.tsx normally never reaches the
// network: its onSubmit calls e.preventDefault() and drives the real
// Supabase signUp() call from client JS. This route only gets hit if that
// JS never finished hydrating — a blocked/failed script chunk, a content
// blocker, a cold-start hiccup — in which case the browser falls back to
// the form's plain HTML submission instead. There's no way to complete a
// Supabase Auth signup safely from a bare POST here (no client SDK context,
// no session), so this doesn't attempt one. It exists purely so that
// failure mode is visible instead of silently reloading a blank form with
// zero indication anything went wrong (see the beta bug report this fixes).
export async function POST(req: NextRequest) {
  const url = new URL("/signup", req.url);
  url.searchParams.set("hydrationFailed", "1");
  return NextResponse.redirect(url, { status: 303 });
}
