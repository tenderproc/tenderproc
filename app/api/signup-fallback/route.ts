import { NextRequest, NextResponse } from "next/server";

// The signup <form> in app/signup/page.tsx normally never reaches the
// network: its onSubmit calls e.preventDefault() and drives the real
// Supabase signUp() call from client JS. This route only gets hit if that
// JS never finished hydrating — most commonly a slow connection, where the
// HTML/CSS is visibly interactive before the JS bundle has finished
// loading/parsing, so a normal-speed click lands as a native form submit
// instead of being caught by React's onSubmit. There's no way to complete a
// Supabase Auth signup safely from a bare POST here (no client SDK context,
// no session), so this doesn't attempt one. It exists purely so that
// failure mode is visible instead of silently reloading a blank form with
// zero indication anything went wrong (see the beta bug report this fixes).
//
// Every field the signup form marks with a `name="r_*"` attribute gets
// echoed back as a query param so the user doesn't have to retype
// everything — see the `recovered()` helper in app/signup/page.tsx, which
// reads these back in on mount. The password field deliberately has no
// `name` attribute in the form, so it is never present in `formData` here
// and never round-trips through this redirect URL.
export async function POST(req: NextRequest) {
  const url = new URL("/signup", req.url);
  url.searchParams.set("hydrationFailed", "1");

  const formData = await req.formData().catch(() => null);
  if (formData) {
    for (const [key, value] of formData.entries()) {
      if (key === "r_sectors") {
        // Multiple checkboxes share this name — collect all checked values
        // into one comma-separated param instead of only keeping the last.
        const existing = url.searchParams.get("r_sectors");
        const values = existing ? existing.split(",") : [];
        if (typeof value === "string" && !values.includes(value)) values.push(value);
        url.searchParams.set("r_sectors", values.join(","));
      } else if (key.startsWith("r_") && typeof value === "string") {
        url.searchParams.set(key, value);
      }
    }
  }

  return NextResponse.redirect(url, { status: 303 });
}
