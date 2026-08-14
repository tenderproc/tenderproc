-- Pre-submission compliance review, submission, outcome tracking (Phase 3) --

-- Widen bids.status to add NO_RESULT (submission outcome, distinct from
-- WON/LOST/WITHDRAWN). The original constraint was declared inline/unnamed
-- on the column, so Postgres auto-named it using its default convention
-- ({table}_{column}_check). If the drop below errors because the name
-- differs in your project, run this first to find the real name:
--   select conname from pg_constraint where conrelid = 'public.bids'::regclass and contype = 'c';
alter table public.bids drop constraint bids_status_check;
alter table public.bids add constraint bids_status_check check (status in
  ('EVALUATION','PREPARATION','REVIEW','READY_TO_SUBMIT','SUBMITTED','WON','LOST','WITHDRAWN','NO_RESULT'));

-- Per-bid snapshot of the tender's required documents (parsed out of
-- tenders.ai_analysis.requiredDocuments at bid-creation time), so each can
-- be tracked/uploaded individually — same snapshot pattern as
-- bid_requirements relative to tender_requirements.
create table public.bid_documents (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids(id) on delete cascade,
  name text not null,
  status text not null default 'MISSING' check (status in ('MISSING','READY')),
  storage_path text,
  file_name text,
  file_size_bytes bigint,
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.bid_documents enable row level security;
create policy "manage own bid documents" on public.bid_documents
  for all using (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()));

-- One row per compliance-review run — a point-in-time snapshot (not a live
-- view), so the review page has history and doesn't need to recompute on
-- every load. requirements/documents counts and critical issues are
-- computed deterministically from the DB by the API route; only
-- "inconsistencies" comes from the AI (see lib/ai/provider.ts
-- runComplianceReview).
create table public.bid_reviews (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids(id) on delete cascade,
  compliance_score int not null default 0,
  ready_to_submit boolean not null default false,
  critical_issues jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  requirements_total int not null default 0,
  requirements_complete int not null default 0,
  documents_total int not null default 0,
  documents_ready int not null default 0,
  unsupported_claims_open int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.bid_reviews enable row level security;
create policy "manage own bid reviews" on public.bid_reviews
  for all using (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()));

-- Outcome recorded after submission. One per bid. Stored for future
-- win-rate analytics (not built this phase — just captured now so it's
-- available later).
create table public.bid_outcomes (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null unique references public.bids(id) on delete cascade,
  outcome text not null check (outcome in ('WON','LOST','WITHDRAWN','NO_RESULT')),
  contract_value numeric,
  duration text,
  notes text,
  reason text,
  winning_bidder text,
  winning_price numeric,
  competitor_score numeric,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bid_outcomes enable row level security;
create policy "manage own bid outcomes" on public.bid_outcomes
  for all using (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()));

-- Storage bucket for uploaded bid documents (private; {user_id}/... prefix,
-- same pattern as company-documents/tender-documents from Phase 1).
insert into storage.buckets (id, name, public) values ('bid-documents', 'bid-documents', false)
  on conflict (id) do nothing;
create policy "own bid documents rw" on storage.objects
  for all using (bucket_id = 'bid-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'bid-documents' and (storage.foldername(name))[1] = auth.uid()::text);
