-- Fixes intermittent 500s from /api/company-search (search_kbo_companies),
-- surfaced by live testing of the signup company-name autocomplete: the
-- very first call after the trigram index goes cold — right after
-- finalize_kbo_companies_reload() rebuilds it for the monthly refresh, or
-- after any quiet period where Postgres evicts its pages from the buffer
-- cache — has to read the GIN index from disk and blows past
-- PostgREST/Supavisor's short default statement timeout for RPC calls,
-- failing with "canceling statement due to statement timeout". Every
-- following call hits a warm cache and succeeds in milliseconds, so this
-- was easy to miss testing by hand but guaranteed to hit real first-time
-- signups. Same fix already applied to prepare/finalize_kbo_companies_reload
-- in supabase-kbo-companies-migration.sql: a function-level `set
-- statement_timeout` overrides the caller's short default for just this
-- call, without touching the project-wide setting. 10s is generous enough
-- for a fully cold read over 2M+ rows while still bounding worst-case
-- latency on a user-facing autocomplete request.
create or replace function search_kbo_companies(search_query text, result_limit int default 8)
returns table (enterprise_number text, denomination text, start_date date)
language sql stable
set statement_timeout = '10s'
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
