-- Unifies the two previously-separate "company profile" data sources:
-- `profiles` (legacy, set at signup, drives AI tender-matching via
-- lib/companyProfile.ts) and `companies` (richer, set on /company, drives
-- eligibility-check/bid-drafting). Matching only ever read `profiles`, so
-- filling in /company had zero effect on match quality — most QA-audited
-- accounts had it empty without realizing it mattered.
--
-- `profiles.sectors` (a closed enum of lib/sectors.ts keys, e.g.
-- "it-telecom") is NOT the same thing as `companies.industries` (free-text
-- tags feeding bid-drafting) even though they sound alike — collapsing them
-- would corrupt bid-drafting data. So this adds a new column,
-- `sector_keys`, specifically for the enum-constrained matching sectors;
-- `industries` is untouched by this migration, byte-for-byte.
--
-- Written defensively (coalesce/array_length checks rather than assuming
-- profiles' exact NOT NULL/default constraints, since that table predates
-- this repo's tracked migrations and its live schema wasn't available at
-- authoring time) — every WHERE clause treats null and empty the same way,
-- so it's safe to run regardless of whether profiles' columns default to
-- null or ''/'{}' on this database.
--
-- Run once, by hand, in the Supabase SQL editor — same convention as every
-- other supabase-*-migration.sql in this repo (no migration tool here).

-- 1. New column for the enum-constrained matching sectors.
alter table public.companies
  add column if not exists sector_keys text[] not null default '{}';

-- 2. Create a `companies` row for every `profiles` row that doesn't have
-- one yet (name is NOT NULL — fall back to the local-part of their auth
-- email if company_name is itself empty, so this can never fail on a real
-- user). Seeds sector_keys/description/company_size/regions_served from
-- profiles at the same time, since these are brand-new companies rows with
-- nothing to conflict with.
insert into public.companies (user_id, name, description, company_size, sector_keys, regions_served)
select
  p.id,
  coalesce(nullif(trim(p.company_name), ''), split_part(u.email, '@', 1)),
  nullif(trim(p.company_description), ''),
  nullif(trim(p.company_size), ''),
  coalesce(p.sectors, '{}'),
  case when nullif(trim(p.address), '') is not null then array[trim(p.address)] else '{}' end
from public.profiles p
join auth.users u on u.id = p.id
where not exists (select 1 from public.companies c where c.user_id = p.id);

-- 3. For users who already have a `companies` row, backfill only the
-- fields that are still empty there — a deliberately-filled-in /company
-- page wins over stale signup data, never the reverse.
update public.companies c
set sector_keys = p.sectors
from public.profiles p
where c.user_id = p.id
  and coalesce(array_length(c.sector_keys, 1), 0) = 0
  and coalesce(array_length(p.sectors, 1), 0) > 0;

update public.companies c
set description = p.company_description
from public.profiles p
where c.user_id = p.id
  and nullif(trim(coalesce(c.description, '')), '') is null
  and nullif(trim(coalesce(p.company_description, '')), '') is not null;

update public.companies c
set company_size = p.company_size
from public.profiles p
where c.user_id = p.id
  and nullif(trim(coalesce(c.company_size, '')), '') is null
  and nullif(trim(coalesce(p.company_size, '')), '') is not null;

update public.companies c
set regions_served = array[trim(p.address)]
from public.profiles p
where c.user_id = p.id
  and coalesce(array_length(c.regions_served, 1), 0) = 0
  and nullif(trim(coalesce(p.address, '')), '') is not null;

-- Verification queries (read-only — run after the above to sanity-check
-- before relying on this data; see the plan's Phase 1 "Verify" section):
--
-- Every user should now have exactly one companies row:
--   select count(*) from auth.users u
--   where not exists (select 1 from public.companies c where c.user_id = u.id);
--   -- expect 0
--
-- No companies.industries row should have changed (regression check that
-- the sectors/industries collision was avoided) — compare against a
-- pre-migration export/snapshot of (user_id, industries) if you took one.
--
-- Spot-check a few users who had both tables filled in, to confirm
-- companies values weren't clobbered by stale profiles data:
--   select p.id, p.sectors as old_sectors, c.sector_keys as new_sector_keys,
--          p.company_description as old_desc, c.description as new_desc
--   from public.profiles p join public.companies c on c.user_id = p.id
--   limit 20;
