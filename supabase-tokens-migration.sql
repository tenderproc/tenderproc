-- Free-tier "tokens" balance for AI-gated actions (app/api/analyze,
-- app/api/chat). PRO/PREMIUM never get a row here — lib/billing/tokens.ts
-- checks getUserTier() first and treats them as unlimited, same pattern
-- subscriptions uses for "Free is an app-side flag, not a billing object".
--
-- Row is created lazily, on a user's first gated call (see
-- lib/billing/tokens.ts's peekTokens()) — not by a signup trigger. Balance
-- starts at 1000 and "tops up to 250" once a month: if the balance is below
-- 250 when next_topup_at is reached, it's raised to 250 (never additive,
-- never lowers a balance already above 250). next_topup_at is advanced by
-- the app, not a DB trigger/cron — this repo has no cron infra for billing
-- (see vercel.json) and a pure lazy computation avoids adding any.
create table public.user_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 1000,
  next_topup_at timestamptz not null default (now() + interval '1 month'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_tokens enable row level security;
create policy "read own tokens" on public.user_tokens
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only the service role (createAdminClient(),
-- via lib/billing/tokens.ts) writes this table, same pattern as subscriptions.
