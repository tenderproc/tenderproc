-- TenderProc AI content translation cache (Increment 2 of quadrilingual UI) --

-- Generic, content-type-agnostic cache for on-demand AI translations of
-- free-text fields. source_table/source_id is a polymorphic pointer (only
-- 'tenders' is used today, but this can extend to bid content later without
-- a schema change). `fields` holds a flat {fieldKey: translatedText} map —
-- the same shape AIProvider.translateFields() returns — keyed the same way
-- app code reads it back, so no reassembly into a nested shape is needed.
--
-- RLS enabled with NO policies: source_id is polymorphic and carries no
-- owner column of its own, so a naive "any authenticated user" policy would
-- let one user read another user's cached tender translation by guessing an
-- id. Instead this is accessed only via the service-role client from route
-- handlers, which check ownership once against the real source row first —
-- same service-role-only precedent as notified_tenders (see docs/database.md).
create table public.content_translations (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  locale text not null check (locale in ('nl','fr','de')),
  fields jsonb not null,
  updated_at timestamptz not null default now(),
  unique (source_table, source_id, locale)
);
alter table public.content_translations enable row level security;
-- No policies: only the service role (this table's route handlers) touches this table.
