import { createClient } from "@supabase/supabase-js";

// Privileged client using the service-role key — bypasses RLS. Server-only
// (the notification cron route); never import this into client components.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
