-- Company knowledge base -------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  description text,
  website text,
  company_size text,
  employee_count int,
  regions_served text[] not null default '{}',
  languages text[] not null default '{}',
  industries text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.companies enable row level security;
create policy "manage own company" on public.companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.company_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
alter table public.company_services enable row level security;
create policy "manage own company services" on public.company_services
  for all using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

create table public.company_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text,
  city text,
  country text not null default 'BE',
  created_at timestamptz not null default now()
);
alter table public.company_locations enable row level security;
create policy "manage own company locations" on public.company_locations
  for all using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

create table public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_type text,
  file_size_bytes bigint,
  notes text,
  uploaded_at timestamptz not null default now()
);
alter table public.company_documents enable row level security;
create policy "manage own company documents" on public.company_documents
  for all using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

create table public.company_certifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  issuing_organization text,
  certificate_number text,
  issue_date date,
  expiry_date date,
  document_id uuid references public.company_documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.company_certifications enable row level security;
create policy "manage own company certifications" on public.company_certifications
  for all using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

create table public.company_references (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client text not null,
  project_name text,
  description text,
  contract_value numeric,
  currency text not null default 'EUR',
  start_date date,
  end_date date,
  location text,
  services text[] not null default '{}',
  is_public boolean,
  document_id uuid references public.company_documents(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.company_references enable row level security;
create policy "manage own company references" on public.company_references
  for all using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- Uploaded tenders (distinct from the live TED feed) -----------------------

create table public.tenders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  title text,
  contracting_authority text,
  reference_number text,
  location text,
  estimated_value numeric,
  currency text not null default 'EUR',
  publication_date date,
  submission_deadline timestamptz,
  contract_duration text,
  description text,
  source_url text,
  status text not null default 'PROCESSING' check (status in ('PROCESSING','ANALYZING','READY','FAILED')),
  ai_summary text,
  ai_match_score int,
  ai_match_label text,
  ai_recommendation text check (ai_recommendation in ('BID','CONSIDER','NO-BID')),
  ai_recommendation_confidence text check (ai_recommendation_confidence in ('HIGH','MEDIUM','LOW')),
  ai_analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenders enable row level security;
create policy "manage own tenders" on public.tenders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.tender_documents (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_type text,
  file_size_bytes bigint,
  extracted_text text,
  processing_status text not null default 'PENDING' check (processing_status in ('PENDING','EXTRACTING','DONE','FAILED')),
  uploaded_at timestamptz not null default now()
);
alter table public.tender_documents enable row level security;
create policy "manage own tender documents" on public.tender_documents
  for all using (exists (select 1 from public.tenders t where t.id = tender_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.tenders t where t.id = tender_id and t.user_id = auth.uid()));

create table public.tender_requirements (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
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
  created_at timestamptz not null default now()
);
alter table public.tender_requirements enable row level security;
create policy "manage own tender requirements" on public.tender_requirements
  for all using (exists (select 1 from public.tenders t where t.id = tender_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.tenders t where t.id = tender_id and t.user_id = auth.uid()));

create table public.tender_award_criteria (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  criterion text not null,
  weight text,
  description text,
  created_at timestamptz not null default now()
);
alter table public.tender_award_criteria enable row level security;
create policy "manage own tender award criteria" on public.tender_award_criteria
  for all using (exists (select 1 from public.tenders t where t.id = tender_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.tenders t where t.id = tender_id and t.user_id = auth.uid()));

-- Storage buckets (private; files live under a {user_id}/... path prefix) --

insert into storage.buckets (id, name, public) values ('company-documents', 'company-documents', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('tender-documents', 'tender-documents', false)
  on conflict (id) do nothing;

create policy "own company documents rw" on storage.objects
  for all using (bucket_id = 'company-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'company-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own tender documents rw" on storage.objects
  for all using (bucket_id = 'tender-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'tender-documents' and (storage.foldername(name))[1] = auth.uid()::text);
