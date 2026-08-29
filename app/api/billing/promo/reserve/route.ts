import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveBetaPromoSlot, type BetaPromoTier } from "@/lib/billing/betaPromo";

const PROMO_TIERS: BetaPromoTier[] = ["PRO", "PREMIUM"];

/** Reserves one of the 20 beta-promo slots for the signed-in user, ahead of
 * opening Paddle Checkout with the returned discountId (see
 * UpgradeButton.tsx). Uses the admin client for the actual reservation
 * (reserve_beta_promo_slot is a service-role-only RPC, same as every other
 * beta_promo_redemptions access) but authenticates the caller first via the
 * session-bound client, same pattern as /api/billing/checkout. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const { tier } = await req.json();
  if (!PROMO_TIERS.includes(tier)) {
    return NextResponse.json({ error: "Invalid tier.", code: "invalidTier" }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await reserveBetaPromoSlot(admin, user.id, tier as BetaPromoTier);

  if (!result.ok) {
    return NextResponse.json({ error: result.reason, code: result.reason }, { status: 409 });
  }
  return NextResponse.json({ discountId: result.discountId, remaining: result.remaining });
}
