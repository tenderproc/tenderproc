-- Bid workspace (Phase 2) ---------------------------------------------------

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tender_id uuid not null unique references public.tenders(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  status text not null default 'EVALUATION' check (status in
    ('EVALUATION','PREPARATION','REVIEW','READY_TO_SUBMIT','SUBMITTED','WON','LOST','WITHDRAWN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bids enable row level security;
create policy "manage own bids" on public.bids
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.bid_requirements (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids(id) on delete cascade,
  tender_requirement_id uuid references public.tender_requirements(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'other' check (category in
    ('eligibility','administrative','technical','experience','certification','personnel','financial','pricing','document','award_criterion','other')),
  mandatory boolean not null default true,
  source_document text,
  source_page int,
  source_section text,
  status text not null default 'NOT_STARTED' check (status in
    ('NOT_STARTED','IN_PROGRESS','COMPLETE','BLOCKED','NOT_APPLICABLE')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bid_requirements enable row level security;
create policy "manage own bid requirements" on public.bid_requirements
  for all using (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()));

create table public.bid_responses (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids(id) on delete cascade,
  bid_requirement_id uuid not null unique references public.bid_requirements(id) on delete cascade,
  draft_text text not null default '',
  confidence text check (confidence in ('HIGH','MEDIUM','LOW')),
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bid_responses enable row level security;
create policy "manage own bid responses" on public.bid_responses
  for all using (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()));

create table public.bid_evidence (
  id uuid primary key default gen_random_uuid(),
  bid_response_id uuid not null references public.bid_responses(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('service','certification','reference')),
  source_id uuid not null,
  label text not null,
  created_at timestamptz not null default now()
);
alter table public.bid_evidence enable row level security;
create policy "manage own bid evidence" on public.bid_evidence
  for all using (exists (
    select 1 from public.bid_responses r join public.bids b on b.id = r.bid_id
    where r.id = bid_response_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.bid_responses r join public.bids b on b.id = r.bid_id
    where r.id = bid_response_id and b.user_id = auth.uid()
  ));

create table public.bid_warnings (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids(id) on delete cascade,
  bid_response_id uuid references public.bid_responses(id) on delete cascade,
  type text not null default 'other' check (type in ('unsupported_claim','other')),
  message text not null,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED','DISMISSED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.bid_warnings enable row level security;
create policy "manage own bid warnings" on public.bid_warnings
  for all using (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.bids b where b.id = bid_id and b.user_id = auth.uid()));
