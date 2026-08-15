create table public.contract_awards (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('ted', 'eprocurement')),
  source_reference text not null,
  contracting_authority text not null,
  cpv_codes text[] not null default '{}',
  award_date date,
  winner_name text,
  winner_country text,
  award_value numeric,
  award_value_currency text,
  ted_published boolean,
  source_url text not null,
  raw_title text,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_reference)
);

alter table public.contract_awards enable row level security;
-- No policies: contract_awards has no natural single owner — it's shared
-- reference data read by every user's incumbent/winner matching lookups.
-- Same service-role-only precedent as content_translations and
-- notified_tenders (see docs/database.md): only ingested/read via
-- createAdminClient() from cron routes and server components.

create index on public.contract_awards (contracting_authority);
create index on public.contract_awards using gin (cpv_codes);
create index on public.contract_awards (award_date);
