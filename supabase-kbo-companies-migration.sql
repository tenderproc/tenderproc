-- KBO Open Data company search, for the signup company-name autocomplete
-- (app/signup/page.tsx). Populated by scripts/import-kbo-companies.ts, not
-- written to by the app itself — see docs/database.md.

create extension if not exists pg_trgm;

create table if not exists kbo_companies (
  id bigserial primary key,
  enterprise_number text not null,
  denomination text not null,
  start_date date,
  created_at timestamptz not null default now()
);

create index if not exists kbo_companies_denomination_trgm_idx
  on kbo_companies using gin (denomination gin_trgm_ops);
create index if not exists kbo_companies_enterprise_number_idx
  on kbo_companies (enterprise_number);

alter table kbo_companies enable row level security;

-- Public government register data — safe to expose read-only to anyone,
-- including the unauthenticated signup page. No insert/update/delete policy
-- is defined: only the service-role import script (which bypasses RLS) can
-- write to this table.
create policy "kbo_companies_public_read" on kbo_companies
  for select using (true);

-- Ranked fuzzy name search: prefix matches ("Van D..." for query "Van D")
-- always outrank pure trigram-similarity hits — raw similarity() alone
-- favors short unrelated names (e.g. "VAN") over true prefix matches
-- (e.g. "Van Duyse, Dirk"), which is wrong for an autocomplete-as-you-type
-- UX. Deduplicated to one (best-matching) row per company.
create or replace function search_kbo_companies(search_query text, result_limit int default 8)
returns table (enterprise_number text, denomination text, start_date date)
language sql stable
as $$
  select enterprise_number, denomination, start_date
  from (
    select distinct on (m.enterprise_number)
      m.enterprise_number, m.denomination, m.start_date, m.score
    from (
      select enterprise_number, denomination, start_date,
             case
               when denomination ilike search_query || '%' then 1 + similarity(denomination, search_query)
               else similarity(denomination, search_query)
             end as score
      from kbo_companies
      where denomination % search_query or denomination ilike search_query || '%'
      order by score desc
      limit result_limit * 5
    ) m
    order by m.enterprise_number, m.score desc
  ) dedup
  order by score desc
  limit result_limit;
$$;

alter table profiles add column if not exists company_number text;

-- Bulk-reload support for scripts/refresh-kbo-companies.ts's automated
-- monthly refresh. Two functions, called before/after the CSV reimport:
-- prepare_kbo_companies_reload truncates the table (fast id-sequence reset,
-- vs. a DELETE over 2M+ rows) and drops the trigram index; without dropping
-- it first, the GIN index's internal "pending list" grows across millions
-- of inserts and its periodic flush got expensive enough to blow past a
-- batch's statement timeout partway through a real reimport (hit at row
-- 1,545,000 of ~2M) — dropping and rebuilding around the bulk load is the
-- standard fix, and only applies here (not the one-time manual
-- scripts/import-kbo-companies.ts, which only ever loads into an empty
-- table once). finalize_kbo_companies_reload rebuilds the index and
-- ANALYZEs afterward (also fixing planner stats, same as the earlier
-- one-off ANALYZE after the very first import — see docs/database.md).
-- security definer on both: TRUNCATE ... RESTART IDENTITY needs ownership
-- of the id sequence, which service_role (the caller, via
-- createAdminClient()) doesn't have even though it bypasses RLS — running
-- as the function's owner (whichever role runs this migration) sidesteps
-- that. Safe here since neither function takes input.
drop function if exists truncate_kbo_companies();

-- set statement_timeout on both: PostgREST/Supavisor enforces a short
-- default statement timeout on RPC calls (fine for the TRUNCATE, but a
-- CREATE INDEX over 2M rows in finalize_kbo_companies_reload blew past it).
-- A function's own SET clause overrides the caller's session timeout for
-- just that call, without touching the project-wide default.
create or replace function prepare_kbo_companies_reload()
returns void
language sql
security definer
set search_path = public
set statement_timeout = '5min'
as $$
  truncate table kbo_companies restart identity;
  drop index if exists kbo_companies_denomination_trgm_idx;
$$;

create or replace function finalize_kbo_companies_reload()
returns void
language sql
security definer
set search_path = public
set statement_timeout = '10min'
as $$
  create index if not exists kbo_companies_denomination_trgm_idx
    on kbo_companies using gin (denomination gin_trgm_ops);
  analyze kbo_companies;
$$;
