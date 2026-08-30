-- Free-tier tender-upload quota for app/api/tenders/upload (the deep AI
-- Bid/No-Bid analysis triggered by uploading a tender PDF) — same pattern
-- as supabase-tokens-migration.sql's user_tokens: PRO/PREMIUM never get a
-- row here (lib/billing/uploads.ts checks getUserTier() first and treats
-- them as unlimited, per FEATURES.UNLIMITED_TENDER_UPLOADS).
--
-- Row is created lazily, on a Free user's first upload attempt (see
-- lib/billing/uploads.ts's peekUploadQuota()) — not by a signup trigger.
-- upload_count resets to 0 once a month (next_reset_at), computed lazily by
-- the app rather than a DB trigger/cron, same "no cron infra for billing"
-- reasoning as user_tokens.
create table public.user_tender_uploads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  upload_count integer not null default 0,
  next_reset_at timestamptz not null default (now() + interval '1 month'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_tender_uploads enable row level security;
create policy "read own upload quota" on public.user_tender_uploads
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only the service role (createAdminClient(),
-- via lib/billing/uploads.ts) writes this table, same pattern as user_tokens.
