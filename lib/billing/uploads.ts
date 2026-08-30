/**
 * Free-tier tender-upload quota — gates app/api/tenders/upload (the deep AI
 * Bid/No-Bid analysis triggered by uploading a tender PDF). PRO/PREMIUM are
 * unlimited (FEATURES.UNLIMITED_TENDER_UPLOADS) and never get a
 * `user_tender_uploads` row, same "Free is an app-side flag, not a billing
 * object" pattern as lib/billing/tokens.ts.
 *
 * Usage in a route:
 *   const quota = await peekUploadQuota(user.id);
 *   if (!quota.unlimited && quota.used >= quota.limit) { ...402... }
 *   // ...run the upload + AI analysis pipeline...
 *   if (!quota.unlimited) await incrementUploadCount(user.id);
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserTier } from "./tiers";
import { addMonthClamped } from "./tokens";

export const FREE_UPLOAD_QUOTA = 3;

export type UploadQuotaStatus =
  | { unlimited: true }
  | { unlimited: false; used: number; limit: number };

type UploadRow = {
  upload_count: number;
  next_reset_at: string;
};

/** Unlike tokens' "top up to a floor", this resets the count to 0 at each
 * monthly boundary crossed — a hard monthly allowance, not a balance. */
function applyMonthlyReset(row: UploadRow, now: Date): UploadRow {
  let uploadCount = row.upload_count;
  let next = new Date(row.next_reset_at);

  while (next.getTime() <= now.getTime()) {
    uploadCount = 0;
    next = addMonthClamped(next);
  }

  return { upload_count: uploadCount, next_reset_at: next.toISOString() };
}

/** Reads (and lazily creates) a FREE user's upload-quota row, applying any
 * owed monthly reset and persisting that catch-up if it changed anything.
 * Never increments. PRO/PREMIUM short-circuit to `{ unlimited: true }`
 * without touching `user_tender_uploads` at all.
 *
 * Fails open (`{ unlimited: true }`, logged) on any unexpected DB error,
 * same trade-off as peekTokens: a gating check being briefly unenforceable
 * is a much smaller problem than a hard outage on tender uploads. */
export async function peekUploadQuota(userId: string): Promise<UploadQuotaStatus> {
  const effective = await getUserTier(userId);
  if (effective.tier !== "FREE") return { unlimited: true };

  const admin = createAdminClient();

  let row: UploadRow | null;
  {
    const { data, error } = await admin
      .from("user_tender_uploads")
      .select("upload_count, next_reset_at")
      .eq("user_id", userId)
      .maybeSingle<UploadRow>();
    if (error) {
      console.error("peekUploadQuota: failed to read user_tender_uploads, failing open", error);
      return { unlimited: true };
    }
    row = data;
  }

  if (!row) {
    const { data: inserted, error: upsertError } = await admin
      .from("user_tender_uploads")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
      .select("upload_count, next_reset_at")
      .maybeSingle<UploadRow>();
    if (upsertError) {
      console.error("peekUploadQuota: failed to create user_tender_uploads row, failing open", upsertError);
      return { unlimited: true };
    }

    if (inserted) {
      row = inserted;
    } else {
      // ignoreDuplicates suppresses the row on conflict — a concurrent
      // request created it first, so re-read.
      const { data: refetched, error: refetchError } = await admin
        .from("user_tender_uploads")
        .select("upload_count, next_reset_at")
        .eq("user_id", userId)
        .maybeSingle<UploadRow>();
      if (refetchError || !refetched) {
        console.error("peekUploadQuota: failed to read user_tender_uploads after insert race, failing open", refetchError);
        return { unlimited: true };
      }
      row = refetched;
    }
  }

  const now = new Date();
  const reset = applyMonthlyReset(row, now);
  if (reset.upload_count !== row.upload_count || reset.next_reset_at !== row.next_reset_at) {
    const { error: updateError } = await admin
      .from("user_tender_uploads")
      .update({ upload_count: reset.upload_count, next_reset_at: reset.next_reset_at, updated_at: now.toISOString() })
      .eq("user_id", userId);
    if (updateError) console.error("peekUploadQuota: failed to persist monthly reset", updateError);
  }

  return { unlimited: false, used: reset.upload_count, limit: FREE_UPLOAD_QUOTA };
}

/** Best-effort increment after a successful upload+analysis. Swallows
 * failures (logs only) rather than throwing — same trade-off as
 * deductTokens: bookkeeping drift here is an accepted beta trade-off, not
 * worth turning an already-successful analysis into a 500. */
export async function incrementUploadCount(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("user_tender_uploads")
    .select("upload_count")
    .eq("user_id", userId)
    .maybeSingle<{ upload_count: number }>();
  if (!row) return;

  const newCount = row.upload_count + 1;
  const { data: updated } = await admin
    .from("user_tender_uploads")
    .update({ upload_count: newCount, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("upload_count", row.upload_count)
    .select("upload_count")
    .maybeSingle();

  if (!updated) {
    // Lost the optimistic-concurrency race — retry once against the
    // now-current value rather than looping indefinitely.
    const { data: retryRow } = await admin
      .from("user_tender_uploads")
      .select("upload_count")
      .eq("user_id", userId)
      .maybeSingle<{ upload_count: number }>();
    if (!retryRow) return;
    const retryCount = retryRow.upload_count + 1;
    const { error } = await admin
      .from("user_tender_uploads")
      .update({ upload_count: retryCount, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("upload_count", retryRow.upload_count);
    if (error) console.error("incrementUploadCount: retry failed", error);
  }
}
