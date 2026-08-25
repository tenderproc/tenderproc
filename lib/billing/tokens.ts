/**
 * Free-tier "tokens" balance — gates app/api/analyze and app/api/chat.
 * PRO/PREMIUM users are unlimited and never get a `user_tokens` row; see
 * docs/database.md's "Token Balance" section for the full design writeup.
 *
 * Usage in a route:
 *   const status = await peekTokens(user.id);
 *   if (!status.unlimited && status.balance < TOKEN_COSTS.ANALYZE) { ...402... }
 *   // ...make the AI call...
 *   if (!status.unlimited) await deductTokens(user.id, TOKEN_COSTS.ANALYZE);
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserTier } from "./tiers";

export const TOKEN_COSTS = {
  ANALYZE: 20,
  CHAT: 10,
} as const;

export const STARTING_BALANCE = 1000;
export const TOPUP_FLOOR = 250;

export type TokenStatus =
  | { unlimited: true }
  | { unlimited: false; balance: number };

type TokenRow = {
  balance: number;
  next_topup_at: string;
};

/** Adds one calendar month to `d`, clamping the day to the target month's
 * last day when it would otherwise overflow (e.g. Jan 31 -> Feb 28, not the
 * raw `Date` rollover to Mar 3). Matches Postgres's own `+ interval '1
 * month'` semantics, which is how `next_topup_at` gets its initial value
 * (see supabase-tokens-migration.sql) — without this, a plain
 * `new Date(y, m+1, d)` advance would silently drift any user whose
 * topup day is the 29th-31st onto a different day once it first crosses a
 * shorter month. */
function addMonthClamped(d: Date): Date {
  const day = d.getDate();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes(), d.getSeconds());
  const daysInNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, daysInNextMonth));
  return next;
}

/** Raises `balance` to TOPUP_FLOOR if a top-up boundary has passed and the
 * balance is currently below it (never additive, never lowers a balance
 * already at or above the floor), advancing `next_topup_at` to the next
 * monthly boundary at or after now. Pure — callers decide whether/how to
 * persist the result. */
function applyTopup(row: TokenRow, now: Date): TokenRow {
  let { balance } = row;
  let next = new Date(row.next_topup_at);

  while (next.getTime() <= now.getTime()) {
    if (balance < TOPUP_FLOOR) balance = TOPUP_FLOOR;
    next = addMonthClamped(next);
  }

  return { balance, next_topup_at: next.toISOString() };
}

/** Reads (and lazily creates) a FREE user's token row, applying any owed
 * top-up and persisting that catch-up if it changed anything. Never
 * deducts. PRO/PREMIUM short-circuit to `{ unlimited: true }` without
 * touching `user_tokens` at all.
 *
 * Fails open (`{ unlimited: true }`, logged) on any unexpected DB error —
 * e.g. `user_tokens` not existing yet because the migration hasn't been
 * run — rather than throwing and taking down the whole route with an
 * unhandled 500. A gating check being briefly unenforceable is a much
 * smaller problem than a hard outage on the AI features it's meant to
 * meter. */
export async function peekTokens(userId: string): Promise<TokenStatus> {
  const effective = await getUserTier(userId);
  if (effective.tier !== "FREE") return { unlimited: true };

  const admin = createAdminClient();

  let row: TokenRow | null;
  {
    const { data, error } = await admin
      .from("user_tokens")
      .select("balance, next_topup_at")
      .eq("user_id", userId)
      .maybeSingle<TokenRow>();
    if (error) {
      console.error("peekTokens: failed to read user_tokens, failing open", error);
      return { unlimited: true };
    }
    row = data;
  }

  if (!row) {
    const { data: inserted, error: upsertError } = await admin
      .from("user_tokens")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
      .select("balance, next_topup_at")
      .maybeSingle<TokenRow>();
    if (upsertError) {
      console.error("peekTokens: failed to create user_tokens row, failing open", upsertError);
      return { unlimited: true };
    }

    if (inserted) {
      row = inserted;
    } else {
      // ignoreDuplicates suppresses the row on conflict — a concurrent
      // request created it first, so re-read.
      const { data: refetched, error: refetchError } = await admin
        .from("user_tokens")
        .select("balance, next_topup_at")
        .eq("user_id", userId)
        .maybeSingle<TokenRow>();
      if (refetchError || !refetched) {
        console.error("peekTokens: failed to read user_tokens after insert race, failing open", refetchError);
        return { unlimited: true };
      }
      row = refetched;
    }
  }

  const now = new Date();
  const toppedUp = applyTopup(row, now);
  if (toppedUp.balance !== row.balance || toppedUp.next_topup_at !== row.next_topup_at) {
    const { error: updateError } = await admin
      .from("user_tokens")
      .update({ balance: toppedUp.balance, next_topup_at: toppedUp.next_topup_at, updated_at: now.toISOString() })
      .eq("user_id", userId);
    if (updateError) console.error("peekTokens: failed to persist top-up catch-up", updateError);
  }

  return { unlimited: false, balance: toppedUp.balance };
}

/** Best-effort decrement after a successful AI call. Swallows failures
 * (logs only) rather than throwing — a lost optimistic-concurrency race or
 * transient DB error shouldn't turn an already-successful AI response into
 * a 500 for the user; bookkeeping drift here is an accepted beta trade-off. */
export async function deductTokens(userId: string, cost: number): Promise<void> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("user_tokens")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle<{ balance: number }>();
  if (!row) return;

  const newBalance = Math.max(0, row.balance - cost);
  const { data: updated } = await admin
    .from("user_tokens")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("balance", row.balance)
    .select("balance")
    .maybeSingle();

  if (!updated) {
    // Lost the optimistic-concurrency race (a concurrent request changed
    // the balance between our read and write) — retry once against the
    // now-current value rather than looping indefinitely.
    const { data: retryRow } = await admin
      .from("user_tokens")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle<{ balance: number }>();
    if (!retryRow) return;
    const retryBalance = Math.max(0, retryRow.balance - cost);
    const { error } = await admin
      .from("user_tokens")
      .update({ balance: retryBalance, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("balance", retryRow.balance);
    if (error) console.error("deductTokens: retry failed", error);
  }
}
