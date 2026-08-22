-- Company Following feature: lets a user track specific companies
-- (competitors/partners) and get alerted when one wins a newly-ingested
-- TED award notice. Two tables, both owner-anchored (auth.uid() = user_id),
-- same RLS pattern as `companies` (see docs/database.md's "RLS pattern").

create table public.followed_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Normalized via lib/companies/normalize.ts at write time, so matching
  -- (lib/companies/followMatch.ts) is a plain equality check, not a
  -- normalize-on-read cost on every ingest-awards run.
  followed_company_name text not null,
  followed_company_display_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, followed_company_name)
);

alter table public.followed_companies enable row level security;

create policy "manage own followed companies" on public.followed_companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index on public.followed_companies (followed_company_name);

-- Dedup/alert ledger, same shape/purpose as notified_tenders: one row per
-- (user, contract_award) match, written by app/api/cron/ingest-awards's
-- follow-matching step, read + stamped emailed_at by
-- app/api/cron/notify's "Companies you follow" email section. Service-role
-- only (no user-facing RLS policy) — same precedent as notified_tenders and
-- contract_awards, since both crons touch this via createAdminClient().
create table public.company_follow_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  followed_company_name text not null,
  contract_award_id uuid not null references public.contract_awards(id) on delete cascade,
  matched_at timestamptz not null default now(),
  emailed_at timestamptz,
  unique (user_id, contract_award_id)
);

alter table public.company_follow_matches enable row level security;

create index on public.company_follow_matches (user_id, emailed_at);
