import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutTransaction } from "@/lib/billing/paddle";
import type { Tier } from "@/lib/billing/types";

const UPGRADABLE_TIERS: Tier[] = ["PRO", "PREMIUM"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const { tier } = await req.json();
  if (!UPGRADABLE_TIERS.includes(tier)) {
    return NextResponse.json({ error: "Invalid tier.", code: "invalidTier" }, { status: 400 });
  }

  try {
    const { checkoutUrl } = await createCheckoutTransaction({
      tier,
      supabaseUserId: user.id,
      customerEmail: user.email,
      returnUrl: `${req.nextUrl.origin}/billing?upgraded=1`,
    });
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, code: "checkoutFailed" }, { status: 502 });
  }
}
