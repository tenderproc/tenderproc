-- Defense-in-depth against HTML/script tags in free-text company-profile
-- fields — found a stored `<script>window.__xssFired=true;</script>` XSS
-- probe in one real production user's companies.description/regions_served
-- (backfilled forward from profiles by the earlier unification migration).
-- Confirmed NOT exploitable as browser XSS today (this app never uses
-- dangerouslySetInnerHTML, so React escapes this text everywhere it's
-- rendered) and not exploitable via email templates either. The real,
-- narrower exposure: this text is fed verbatim into the AI match-scoring
-- prompt (lib/scoring.ts's profileText) for the user's own results — a
-- prompt-injection surface, single-user blast radius.
--
-- This is a defense-in-depth fix, not an access-control fix — RLS already
-- restricts writes to a user's own row. The actual reason this needs to be
-- a DB trigger rather than an app-code check: components/company/
-- CompanyCoreForm.tsx writes to `companies` directly from the browser via
-- the Supabase client (RLS-gated, but no server route in between), so
-- app-code sanitization in e.g. app/api/signup-profile/route.ts alone
-- would not cover that write path. A trigger covers every write
-- regardless of where it comes from.
--
-- Strips HTML-tag-like substrings (`<...>`) rather than rejecting the
-- write outright, since a legitimate business description could contain a
-- stray "<" or ">" (e.g. "revenue < €1M") that isn't actually a tag —
-- rejecting those would be a worse false-positive experience than quietly
-- stripping anything that looks tag-shaped.

create or replace function public.strip_html_tags(input text)
returns text
language sql
immutable
as $$
  select case when input is null then null else regexp_replace(input, '<[^>]*>', '', 'g') end;
$$;

create or replace function public.sanitize_companies_text()
returns trigger
language plpgsql
as $$
begin
  new.description := public.strip_html_tags(new.description);
  new.name := public.strip_html_tags(new.name);
  new.website := public.strip_html_tags(new.website);
  -- array_agg over unnest() of an empty array returns NULL, not '{}' — and
  -- regions_served/industries/languages are all `not null default '{}'`,
  -- so without the coalesce this fails the NOT NULL constraint on every
  -- row where one of these is currently empty (i.e. most rows). Caught
  -- this from the actual constraint-violation error on first run.
  if new.regions_served is not null then
    new.regions_served := coalesce(
      (select array_agg(public.strip_html_tags(v)) from unnest(new.regions_served) as v),
      '{}'::text[]
    );
  end if;
  if new.industries is not null then
    new.industries := coalesce(
      (select array_agg(public.strip_html_tags(v)) from unnest(new.industries) as v),
      '{}'::text[]
    );
  end if;
  if new.languages is not null then
    new.languages := coalesce(
      (select array_agg(public.strip_html_tags(v)) from unnest(new.languages) as v),
      '{}'::text[]
    );
  end if;
  return new;
end;
$$;

drop trigger if exists sanitize_companies_text_trigger on public.companies;
create trigger sanitize_companies_text_trigger
  before insert or update on public.companies
  for each row execute function public.sanitize_companies_text();

-- Same treatment for company_services/company_references (name/description
-- fields), since these are also user-free-text and also client-writable
-- directly (ServicesSection.tsx / ReferencesSection.tsx).
create or replace function public.sanitize_company_services_text()
returns trigger
language plpgsql
as $$
begin
  new.name := public.strip_html_tags(new.name);
  new.description := public.strip_html_tags(new.description);
  return new;
end;
$$;

drop trigger if exists sanitize_company_services_text_trigger on public.company_services;
create trigger sanitize_company_services_text_trigger
  before insert or update on public.company_services
  for each row execute function public.sanitize_company_services_text();

create or replace function public.sanitize_company_references_text()
returns trigger
language plpgsql
as $$
begin
  new.client := public.strip_html_tags(new.client);
  new.project_name := public.strip_html_tags(new.project_name);
  new.description := public.strip_html_tags(new.description);
  return new;
end;
$$;

drop trigger if exists sanitize_company_references_text_trigger on public.company_references;
create trigger sanitize_company_references_text_trigger
  before insert or update on public.company_references
  for each row execute function public.sanitize_company_references_text();

-- One-time cleanup of the already-known-contaminated row (and anything
-- else already sitting in the table matching the same pattern) — the
-- trigger above only covers writes from this point forward.
update public.companies
set description = public.strip_html_tags(description),
    name = public.strip_html_tags(name),
    website = public.strip_html_tags(website),
    regions_served = coalesce((select array_agg(public.strip_html_tags(v)) from unnest(regions_served) as v), '{}'::text[]),
    industries = coalesce((select array_agg(public.strip_html_tags(v)) from unnest(industries) as v), '{}'::text[]),
    languages = coalesce((select array_agg(public.strip_html_tags(v)) from unnest(languages) as v), '{}'::text[])
where description ~ '<[^>]*>'
   or name ~ '<[^>]*>'
   or website ~ '<[^>]*>'
   or exists (select 1 from unnest(regions_served) as v where v ~ '<[^>]*>')
   or exists (select 1 from unnest(industries) as v where v ~ '<[^>]*>')
   or exists (select 1 from unnest(languages) as v where v ~ '<[^>]*>');

update public.company_services
set name = public.strip_html_tags(name), description = public.strip_html_tags(description)
where name ~ '<[^>]*>' or description ~ '<[^>]*>';

update public.company_references
set client = public.strip_html_tags(client),
    project_name = public.strip_html_tags(project_name),
    description = public.strip_html_tags(description)
where client ~ '<[^>]*>' or project_name ~ '<[^>]*>' or description ~ '<[^>]*>';

-- Verification (read-only): should return zero rows after running the
-- above.
--   select id, description, name, regions_served from public.companies
--   where description ~ '<[^>]*>' or name ~ '<[^>]*>'
--      or exists (select 1 from unnest(regions_served) as v where v ~ '<[^>]*>');
