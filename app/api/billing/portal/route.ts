import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCustomerPortalSession } from "@/lib/billing/paddle";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated.", code: "notAuthenticated" }, { status: 401 });
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("paddle_customer_id, paddle_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.paddle_customer_id) {
    return NextResponse.json(
      { error: "No billing account yet — upgrade to a paid plan first.", code: "noBillingAccount" },
      { status: 404 }
    );
  }

  try {
    const session = await createCustomerPortalSession(
      sub.paddle_customer_id,
      sub.paddle_subscription_id ? [sub.paddle_subscription_id] : []
    );
    return NextResponse.json({ portalUrl: session.urls.general.overview });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, code: "portalFailed" }, { status: 502 });
  }
}
