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

-- Used by scripts/refresh-kbo-companies.ts's automated monthly refresh
-- (truncateFirst) — a single TRUNCATE is far faster than a DELETE over
-- 2M+ rows, and resets the id sequence so re-imports don't grow unbounded.
create or replace function truncate_kbo_companies()
returns void
language sql
as $$
  truncate table kbo_companies restart identity;
$$;
