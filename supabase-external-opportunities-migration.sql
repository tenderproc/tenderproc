-- Regional Belgian tender sources beyond TED: three Walloon/Flemish
-- council-transparency platforms (deliberations.be, conseilcommunal.be,
-- Flanders' Gelinkt Notuleren), scraped by a local process (multi-hour
-- crawls across hundreds of endpoints — not viable as a live per-page-load
-- fetch) and pushed here. BOSA is deliberately NOT persisted to this table:
-- unlike the regional sources, its search API responds fast enough for a
-- live fetch (see lib/bosa.ts's searchBosaTenders), so it's queried live
-- and merged with TED directly in Opportunities, same pattern as TED
-- itself — no separate ingestion/staleness concern for that source.
--
-- Shared reference data with no natural single owner, same precedent as
-- contract_awards/notified_tenders: RLS enabled, no policies, read only
-- via createAdminClient() from Server Components.
create table public.external_opportunities (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in (
    'wallonia_deliberations', 'wallonia_conseilcommunal', 'flanders_gelinkt_notuleren'
  )),
  source_reference text not null,
  title text not null,
  buyer_name text,
  description text,
  cpv_codes text[] not null default '{}',
  estimated_value numeric,
  estimated_value_currency text,
  deadline date,
  publication_date date,
  region text,
  source_url text not null,
  -- Metadata only, NOT a filter on what Opportunities shows (explicit
  -- product decision: show all scraped tenders regardless of kind).
  -- 'open': a genuine call for tenders someone could still bid on.
  -- 'awarded': already decided (framework call-off, negotiated-without-
  --   publication purchase, named winner) — also dual-written to
  --   contract_awards for incumbent-screening, in addition to appearing
  --   here.
  -- 'unclear': matched a procurement keyword but neither marker fired.
  notice_kind text not null check (notice_kind in ('open', 'awarded', 'unclear')),
  dedup_status text not null default 'candidate' check (dedup_status in ('candidate', 'confirmed_duplicate')),
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_reference)
);

alter table public.external_opportunities enable row level security;
-- No policies — same precedent as contract_awards: shared reference data,
-- read only via createAdminClient() from Server Components.

create index on public.external_opportunities (notice_kind);
create index on public.external_opportunities using gin (cpv_codes);
create index on public.external_opportunities (deadline);

-- Widen contract_awards to accept the same three regional sources for the
-- 'awarded'-classified subset of scraped data.
alter table public.contract_awards drop constraint contract_awards_source_check;
alter table public.contract_awards add constraint contract_awards_source_check
  check (source in (
    'ted', 'eprocurement',
    'wallonia_deliberations', 'wallonia_conseilcommunal', 'flanders_gelinkt_notuleren'
  ));
