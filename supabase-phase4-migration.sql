-- TenderProc Score, Why Not Bid, requirement -> evidence mapping (Increment 1) --

-- Two new columns on tenders holding the extra structure the enriched
-- generateBidRecommendation() now returns, alongside the existing
-- ai_match_score/ai_match_label/ai_recommendation/ai_recommendation_confidence
-- columns and the ai_analysis jsonb grab-bag (risks/ambiguities/etc). Kept as
-- separate columns rather than folded into ai_analysis since they're
-- structurally distinct (an array of dimension objects, an array of
-- disqualifier objects) and this keeps them easy to reason about/query later.
alter table public.tenders add column ai_scorecard_dimensions jsonb;
alter table public.tenders add column ai_disqualifiers jsonb default '[]'::jsonb;

-- Tender-level, pre-bid requirement -> evidence coverage. One row per
-- tender_requirement (the "status" line), with child rows for however many
-- company evidence items were cited — same one-row-per-requirement +
-- child-evidence-rows pattern as bid_responses/bid_evidence.
create table public.tender_requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  tender_requirement_id uuid not null unique references public.tender_requirements(id) on delete cascade,
  status text not null default 'NEEDS_REVIEW' check (status in
    ('VERIFIED','PARTIAL','MISSING','CONTRADICTED','NEEDS_REVIEW')),
  confidence text check (confidence in ('HIGH','MEDIUM','LOW')),
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.tender_requirement_evidence enable row level security;
create policy "manage own tender requirement evidence" on public.tender_requirement_evidence
  for all using (exists (
    select 1 from public.tender_requirements tr join public.tenders t on t.id = tr.tender_id
    where tr.id = tender_requirement_id and t.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.tender_requirements tr join public.tenders t on t.id = tr.tender_id
    where tr.id = tender_requirement_id and t.user_id = auth.uid()
  ));

-- tender_requirement_id is denormalized here (copied from the parent
-- tender_requirement_evidence row) purely to keep RLS a 2-level join, same
-- reason bid_warnings carries a direct bid_id instead of only its immediate
-- parent's id — see docs/database.md's RLS pattern note.
create table public.tender_requirement_evidence_items (
  id uuid primary key default gen_random_uuid(),
  tender_requirement_evidence_id uuid not null references public.tender_requirement_evidence(id) on delete cascade,
  tender_requirement_id uuid not null references public.tender_requirements(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('service','certification','reference')),
  evidence_id uuid not null,
  label text not null
);
alter table public.tender_requirement_evidence_items enable row level security;
create policy "manage own tender requirement evidence items" on public.tender_requirement_evidence_items
  for all using (exists (
    select 1 from public.tender_requirements tr join public.tenders t on t.id = tr.tender_id
    where tr.id = tender_requirement_id and t.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.tender_requirements tr join public.tenders t on t.id = tr.tender_id
    where tr.id = tender_requirement_id and t.user_id = auth.uid()
  ));
