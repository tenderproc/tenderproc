# Database

Postgres via Supabase. Every table has Row-Level Security enabled; every policy scopes
access to the requesting user's own data (`auth.uid()`), either directly (tables with a
`user_id` column) or via an `exists (...)` join to a parent table that has one. There is no
team/multi-user-per-company concept yet — one `auth.users` row owns exactly one `companies`
row (`companies.user_id` is `unique`).

## Existing tables (predate this expansion)

| Table | Purpose |
|---|---|
| `profiles` | One row per user. `sectors`/`languages`/`company_name`/`address`/`company_size`/`company_description`, collected at signup. Powers the live-TED match-scoring feature (`lib/scoring.ts`) and the Opportunities/Search sector filter. Not touched by this expansion. |
| `notified_tenders` | Dedup ledger for the daily email-digest cron job. Service-role only, no user-facing RLS policy. |
| `pipeline_items` | The lightweight Workflow kanban — tracks a *live TED* tender through `screening/reviewing/applying/submitted/won/lost`. Unrelated to the new `tenders` table below. |
| `tender_scores` | Cache for the metadata-only TED-feed match score, keyed by `(user_id, publication_number, profile_hash)`. |

## New tables (this expansion)

### Company knowledge base

| Table | Key columns |
|---|---|
| `companies` | `user_id` (unique), `name`, `description`, `website`, `company_size`, `employee_count`, `regions_served text[]`, `languages text[]`, `industries text[]` |
| `company_services` | `company_id`, `name`, `description` |
| `company_locations` | `company_id`, `label`, `city`, `country` (default `'BE'`) |
| `company_documents` | `company_id`, `file_name`, `storage_path`, `file_type`, `file_size_bytes`, `notes` — files live in the `company-documents` Storage bucket |
| `company_certifications` | `company_id`, `name`, `issuing_organization`, `certificate_number`, `issue_date`, `expiry_date`, `document_id → company_documents` (nullable), `notes` |
| `company_references` | `company_id`, `client`, `project_name`, `description`, `contract_value`, `currency`, `start_date`, `end_date`, `location`, `services text[]`, `is_public`, `document_id → company_documents` (nullable) |

### Uploaded tenders

| Table | Key columns |
|---|---|
| `tenders` | `user_id`, `company_id` (nullable), `title`, `contracting_authority`, `reference_number`, `location`, `estimated_value`, `currency`, `publication_date`, `submission_deadline`, `contract_duration`, `description`, `source_url`, `status` (`PROCESSING/ANALYZING/READY/FAILED`), `ai_summary`, `ai_match_score`, `ai_match_label`, `ai_recommendation` (`BID/CONSIDER/NO-BID`), `ai_recommendation_confidence`, `ai_analysis jsonb` (risks/ambiguities/positiveFactors/estimatedEffortHours — anything not normalized into a child table) |
| `tender_documents` | `tender_id`, `file_name`, `storage_path`, `file_type`, `file_size_bytes`, `extracted_text`, `processing_status` (`PENDING/EXTRACTING/DONE/FAILED`) — files live in the `tender-documents` Storage bucket |
| `tender_requirements` | `tender_id`, `title`, `description`, `category` (`eligibility/administrative/technical/experience/certification/personnel/financial/pricing/document/award_criterion/other`), `mandatory`, `source_document`, `source_page`, `source_section`, `status` (`NOT_STARTED/IN_PROGRESS/COMPLETE/BLOCKED/NOT_APPLICABLE` — column exists for schema completeness; Phase 1 UI only displays it, Phase 2 lets a user change it as they work a requirement) |
| `tender_award_criteria` | `tender_id`, `criterion`, `weight` (text — weights aren't always numeric), `description` |

### Bid workspace (Phase 2)

| Table | Key columns |
|---|---|
| `bids` | `user_id`, `tender_id` (`unique` — one bid per tender), `company_id` (nullable), `status` (`EVALUATION/PREPARATION/REVIEW/READY_TO_SUBMIT/SUBMITTED/WON/LOST/WITHDRAWN`). Score/recommendation/deadline are read via join to `tenders`, not duplicated. |
| `bid_requirements` | A per-bid *snapshot* of `tender_requirements` at bid-creation time (`tender_requirement_id` nullable fk back to the original, but the row itself is independent): `bid_id`, `title`, `description`, `category`, `mandatory`, `source_document`, `source_page`, `source_section`, `status` (same 5-value enum, now actually mutable from the requirement's own page) |
| `bid_responses` | One per requirement (`bid_requirement_id unique`): `bid_id`, `bid_requirement_id`, `draft_text`, `confidence` (`HIGH/MEDIUM/LOW`), `accepted` |
| `bid_evidence` | Which company facts backed a response: `bid_response_id`, `evidence_type` (`service/certification/reference`), `source_id` (the originating `company_*` row id — polymorphic, no enforced FK), `label` (snapshot, survives if the source row is later edited) |
| `bid_warnings` | `bid_id` (direct, not just via `bid_response_id`, so RLS/queries don't need a 3-level join), `bid_response_id` (nullable), `type` (`unsupported_claim/other`), `message`, `status` (`OPEN/RESOLVED/DISMISSED`), `resolved_at` |

`bid_reviews`/`bid_outcomes` are not created — Phase 3.

All `category`/`status` values are enforced with `check` constraints, matching
`REQUIREMENT_CATEGORIES` in `lib/ai/types.ts` — if that list ever changes, the SQL check
constraint needs a migration to match.

## Storage

Two private buckets, `company-documents` and `tender-documents`. Objects are stored under a
`{user_id}/...` path prefix; the bucket policy checks
`(storage.foldername(name))[1] = auth.uid()::text`, so a user can only read/write objects
under their own prefix regardless of which table references them.

## RLS pattern

Owner-anchored tables (`companies`, `tenders`):

```sql
create policy "manage own X" on public.X
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Child tables (everything else new), scoped via their parent:

```sql
create policy "manage own X" on public.X
  for all using (exists (select 1 from public.parent p where p.id = X.parent_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.parent p where p.id = X.parent_id and p.user_id = auth.uid()));
```

This is the same pattern `pipeline_items`/`tender_scores` already used before this
expansion — no new authorization approach was introduced. The one 2-level join is
`bid_evidence` (via `bid_responses` → `bids`) — `bid_responses` and `bid_warnings` were
deliberately given a direct `bid_id` (not just their immediate parent) specifically to avoid
needing deeper joins than that anywhere.

## Migration

There's no migrations folder/tool in this project — SQL is delivered as a block, run once
by hand in the Supabase SQL editor, and verified afterward via a read-only REST probe
against each new table/bucket. `supabase-phase1-migration.sql` and
`supabase-phase2-migration.sql` at the repo root are kept for reference; not re-run.
