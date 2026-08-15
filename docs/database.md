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
| `tenders` | `user_id`, `company_id` (nullable), `title`, `contracting_authority`, `reference_number`, `location`, `estimated_value`, `currency`, `publication_date`, `submission_deadline`, `contract_duration`, `description`, `source_url`, `status` (`PROCESSING/ANALYZING/READY/FAILED`), `ai_summary`, `ai_match_score`, `ai_match_label`, `ai_recommendation` (`BID/CONSIDER/NO-BID`), `ai_recommendation_confidence`, `ai_analysis jsonb` (risks/ambiguities/positiveFactors/estimatedEffortHours — anything not normalized into a child table), `ai_scorecard_dimensions jsonb` (Increment 1 — the TenderProc Score breakdown), `ai_disqualifiers jsonb` (Increment 1 — the "Why Not Bid" list) |
| `tender_documents` | `tender_id`, `file_name`, `storage_path`, `file_type`, `file_size_bytes`, `extracted_text`, `processing_status` (`PENDING/EXTRACTING/DONE/FAILED`) — files live in the `tender-documents` Storage bucket |
| `tender_requirements` | `tender_id`, `title`, `description`, `category` (`eligibility/administrative/technical/experience/certification/personnel/financial/pricing/document/award_criterion/other`), `mandatory`, `source_document`, `source_page`, `source_section`, `status` (`NOT_STARTED/IN_PROGRESS/COMPLETE/BLOCKED/NOT_APPLICABLE` — column exists for schema completeness; Phase 1 UI only displays it, Phase 2 lets a user change it as they work a requirement) |
| `tender_award_criteria` | `tender_id`, `criterion`, `weight` (text — weights aren't always numeric), `description` |

### Bid workspace (Phase 2)

| Table | Key columns |
|---|---|
| `bids` | `user_id`, `tender_id` (`unique` — one bid per tender), `company_id` (nullable), `status` (`EVALUATION/PREPARATION/REVIEW/READY_TO_SUBMIT/SUBMITTED/WON/LOST/WITHDRAWN/NO_RESULT` — `NO_RESULT` added in Phase 3). Score/recommendation/deadline are read via join to `tenders`, not duplicated. |
| `bid_requirements` | A per-bid *snapshot* of `tender_requirements` at bid-creation time (`tender_requirement_id` nullable fk back to the original, but the row itself is independent): `bid_id`, `title`, `description`, `category`, `mandatory`, `source_document`, `source_page`, `source_section`, `status` (same 5-value enum, now actually mutable from the requirement's own page) |
| `bid_responses` | One per requirement (`bid_requirement_id unique`): `bid_id`, `bid_requirement_id`, `draft_text`, `confidence` (`HIGH/MEDIUM/LOW`), `accepted` |
| `bid_evidence` | Which company facts backed a response: `bid_response_id`, `evidence_type` (`service/certification/reference`), `source_id` (the originating `company_*` row id — polymorphic, no enforced FK), `label` (snapshot, survives if the source row is later edited) |
| `bid_warnings` | `bid_id` (direct, not just via `bid_response_id`, so RLS/queries don't need a 3-level join), `bid_response_id` (nullable), `type` (`unsupported_claim/other`), `message`, `status` (`OPEN/RESOLVED/DISMISSED`), `resolved_at` |

### Pre-submission review, submission, outcomes (Phase 3)

| Table | Key columns |
|---|---|
| `bid_documents` | A per-bid *snapshot* of the tender's required documents — parsed out of `tenders.ai_analysis.requiredDocuments` (a plain jsonb string array; never normalized into its own table at tender level) at bid-creation time, same snapshot pattern as `bid_requirements`. `bid_id`, `name`, `status` (`MISSING/READY`), `storage_path`, `file_name`, `file_size_bytes`, `uploaded_at` — files live in the `bid-documents` Storage bucket, but `status` can also be toggled to `READY` without a file attached |
| `bid_reviews` | One row per compliance-review run — a point-in-time snapshot, not a live view, so the review page has history and doesn't recompute on every load: `bid_id`, `compliance_score`, `ready_to_submit`, `critical_issues jsonb`, `warnings jsonb`, `requirements_total/complete`, `documents_total/ready`, `unsupported_claims_open`. `requirements_total/complete`, `documents_total/ready`, `critical_issues`, and most of `warnings` are computed directly from `bid_requirements`/`bid_documents`/`bid_warnings` rows in `app/api/bids/[bidId]/review/route.ts`; only the AI-sourced entries in `warnings` (cross-response contradictions) come from `AIProvider.runComplianceReview()` — see `docs/ai.md` |
| `bid_outcomes` | One per bid (`bid_id unique`): `outcome` (`WON/LOST/WITHDRAWN/NO_RESULT`), WON fields (`contract_value`, `duration`, `notes`), LOST fields (`reason`, `winning_bidder`, `winning_price`, `competitor_score`, `feedback`). Stored for future win-rate analytics — not built yet, just captured now per the spec's "future learning" section |

### Requirement → evidence mapping (Increment 1)

| Table | Key columns |
|---|---|
| `tender_requirement_evidence` | Tender-level, pre-bid evidence coverage — one row per requirement (`tender_requirement_id unique`): `status` (`VERIFIED/PARTIAL/MISSING/CONTRADICTED/NEEDS_REVIEW`), `confidence`, `notes`. Recomputed (delete-then-insert of its child rows) each time "Map Evidence to Requirements" is run — see `docs/ai.md`'s `mapRequirementsToEvidence()` |
| `tender_requirement_evidence_items` | The specific company evidence cited for a requirement's mapping: `tender_requirement_evidence_id`, `evidence_type` (`service/certification/reference`), `evidence_id` (the originating `company_*` row id, polymorphic, no enforced FK), `label` (snapshot). Also carries a denormalized `tender_requirement_id` purely so its RLS stays a 2-level join instead of 3 — see the RLS pattern note below |

All `category`/`status` values are enforced with `check` constraints, matching
`REQUIREMENT_CATEGORIES` in `lib/ai/types.ts` — if that list ever changes, the SQL check
constraint needs a migration to match.

## Storage

Three private buckets: `company-documents`, `tender-documents`, and `bid-documents` (Phase
3). Objects are stored under a `{user_id}/...` path prefix; the bucket policy checks
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
expansion — no new authorization approach was introduced. The 2-level joins are
`bid_evidence` (via `bid_responses` → `bids`) and `tender_requirement_evidence` (via
`tender_requirements` → `tenders`) — child tables one level further down
(`bid_warnings`, `tender_requirement_evidence_items`) were deliberately given a direct
reference to the grandparent (`bid_id`, `tender_requirement_id`) specifically to avoid
needing deeper joins than 2 levels anywhere.

## Migration

There's no migrations folder/tool in this project — SQL is delivered as a block, run once
by hand in the Supabase SQL editor, and verified afterward via a read-only REST probe
against each new table/bucket. `supabase-phase1-migration.sql`, `supabase-phase2-migration.sql`,
`supabase-phase3-migration.sql`, and `supabase-phase4-migration.sql` at the repo root are
kept for reference; not re-run. The Phase 3 migration also widens the existing
`bids.status` check constraint (drops and re-adds it with `NO_RESULT` included) — the one
instance so far of altering rather than only adding.
