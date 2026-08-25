# Database

Postgres via Supabase. Every table has Row-Level Security enabled; every policy scopes
access to the requesting user's own data (`auth.uid()`), either directly (tables with a
`user_id` column) or via an `exists (...)` join to a parent table that has one. There is no
team/multi-user-per-company concept yet — one `auth.users` row owns exactly one `companies`
row (`companies.user_id` is `unique`).

## Existing tables (predate this expansion)

| Table | Purpose |
|---|---|
| `profiles` | One row per user. `sectors`/`company_name`/`company_number`/`address`/`company_size`/`company_description`, collected at signup (`company_number` nullable — only set if the user picked a result from the KBO autocomplete rather than free-typing a name; see Company search below), plus `language` (nullable text; `null` = All languages, otherwise a single `lib/languages.ts` key — the sidebar's exclusive-single-select filter, see `supabase-language-filter-single-select-migration.sql`; both filters *and* prioritizes display for that language). Powers the live-TED match-scoring feature (`lib/scoring.ts`) and the Opportunities/Search sector filter. Not touched by this expansion. |
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

### Contract awards ("Beyond Alerts" Feature 1)

| Table | Key columns |
|---|---|
| `contract_awards` | Historical award notices, ingested (not live-fetched) — powers incumbent/winner screening and Tender Forecast. `source` (`ted`/`eprocurement` — only `ted` is actually ingested today; `eprocurement` blocked, see below), `source_reference` (TED publication-number), unique on `(source, source_reference)`. `contracting_authority`, `cpv_codes text[]`, `award_date`, `winner_name`, `winner_country`, `award_value`, `award_value_currency`, `ted_published`, `source_url`, `raw_title`. Service-role only, no user-facing RLS policy — same precedent as `notified_tenders`, since awards have no single owning user. Populated by `app/api/cron/ingest-awards/route.ts`. e-Procurement (`publicprocurement.be`) was evaluated as a second source but its search API enforces a server-side origin allowlist (403 for any non-`www.publicprocurement.be` caller) — not integrated. |

### Tender Forecast (extends `contract_awards`, see `supabase-forecast-migration.sql`)

Three columns added to `contract_awards`, no new table — a forecast is a property of the
award itself: `contract_duration_months` (nullable int), `duration_confidence` (`confirmed`
/`estimated`/`unknown`, default `unknown`), `estimated_expiry_date` (nullable date, indexed).
Computed by `lib/forecast/expiry.ts`'s `computeEstimatedExpiry()`, called from the same
`ingest-awards` cron run that writes the rest of the row: `confirmed` when TED's own eForms
fields state a duration or end date directly (`lib/ted.ts`'s `parseAwardDuration` — see the
`AWARD_FIELDS` comment for verified field names/fill rates — with a small Anthropic call,
`AIProvider.extractAwardDuration()`, as a narrow fallback when only free-text renewal terms
are published); `estimated` when neither is available and the CPV-prefix fallback table
(`lib/forecast/durationDefaults.ts`) has a typical-length entry for the award's sector;
`unknown` (with `estimated_expiry_date` left `null`) when neither source has anything —
never guessed. The cron's final step also re-derives every non-`confirmed` row's expiry
against the current fallback table, so an edit to `durationDefaults.ts` reaches
already-ingested rows on the next run. `/forecast` and `/forecast/[id]` read this table via
`createAdminClient()` (same as `app/my-tenders/[tenderId]/page.tsx` already does), filtering
`estimated_expiry_date` into the user's chosen window at query time rather than maintaining a
separate "in window" flag column. Sector matching reuses `lib/sectors.ts`'s
`sectorsToCpvPrefixes()` (`lib/forecast/matching.ts`) — the same CPV-prefix filter
Opportunities and the ingestion cron use — not the separate per-tender AI match-score system
(`lib/scoring.ts`), since that would mean a fresh Anthropic call per viewer for a shared,
slowly-changing table. "Add to workflow" on a forecast needs no `pipeline_items` schema
change: TED's by-ID lookup (`getTenderById`) isn't restricted to open-call notice types, so
`contract_awards.source_reference` already works as `pipeline_items.publication_number`
end-to-end (confirmed live against TED's Search API).

### Market Share & Company Following (extends `contract_awards`, see `supabase-company-following-migration.sql`)

Market Share (`/market`) reads `contract_awards` the same way `/forecast` does — via
`createAdminClient()`, sector-filtered with `lib/forecast/matching.ts`'s
`filterAwardsBySector()` — and adds no new table: it's a read/aggregation over existing rows
(`lib/marketShare/compute.ts`'s `computeMarketShare()`), grouped by
`lib/companies/normalize.ts`'s `normalizeCompanyName()` rather than raw `winner_name`, so
legal-suffix/casing/whitespace variants of the same company collapse into one row.

Company Following (`/market/following`) adds two tables:

| Table | Key columns |
|---|---|
| `followed_companies` | `user_id`, `followed_company_name` (normalized, unique per user), `followed_company_display_name` (raw, as first followed), `created_at`. Owner-anchored RLS (`auth.uid() = user_id`), same as `companies`. |
| `company_follow_matches` | Dedup/alert ledger, same shape and purpose as `notified_tenders`: `user_id`, `followed_company_name`, `contract_award_id → contract_awards(id)`, `matched_at`, `emailed_at` (nullable). Unique on `(user_id, contract_award_id)`. Service-role only, no user-facing RLS policy — same precedent as `notified_tenders`/`contract_awards`. |

Written by `app/api/cron/ingest-awards/route.ts`: after each page's `contract_awards` upsert,
that batch's winners are matched (`lib/companies/followMatch.ts`'s `matchFollowedCompanies()`,
same normalization as Market Share) against every `followed_companies` row, and a
`company_follow_matches` row is inserted per match (`onConflict` + `ignoreDuplicates`, so
re-matching an already-seen award on a later run is a harmless no-op). Only runs against each
day's newly-upserted batch, not the full historical table — following a company doesn't
retroactively surface its past awards, only ones ingested from that point forward.

Read by `app/api/cron/notify/route.ts`: pending matches (`emailed_at is null`) are folded into
that user's daily digest email (`lib/email.ts`'s `sendNewTendersEmail()`, extended with an
optional "Companies you follow" section), then stamped `emailed_at`. Unlike the tender digest,
there's no "first run" bootstrap suppression for company matches — since matching only ever
looks at newly-ingested rows, there's no historical backlog to accidentally dump on a new
follower.

### Token Balance (see `supabase-tokens-migration.sql`)

Free-tier credit system, called "tokens" in the UI, gating `app/api/analyze` (20/call) and
`app/api/chat` (10/call — the support widget, not an AI copilot; both routes require login,
no anonymous access at all). One table, `public.user_tokens`: `user_id` (PK), `balance`
(starts 1000), `next_topup_at` (starts now + 1 month). PRO/PREMIUM users never get a row —
`lib/billing/tokens.ts` checks `getUserTier()` first and treats them as unlimited, same "Free
is an app-side flag" precedent as `subscriptions`.

Row is created lazily on a user's first gated call, not a signup trigger. "Tops up to 250
monthly" means raised to 250 only if currently below it when `next_topup_at` is reached —
never additive, never lowers a balance already above 250 — computed and persisted lazily by
`lib/billing/tokens.ts`'s `peekTokens()` (called from both the two gated routes and the
billing page's display), not a DB trigger or cron. Deduction (`deductTokens()`) happens after
a successful Anthropic call, not before — a failed/rejected AI call never costs tokens — and
is best-effort (logged, not thrown, on a lost optimistic-concurrency race), matching this
codebase's existing beta-scope simplicity elsewhere (`UploadAnalyzer.tsx`).

### Company search (signup autocomplete, see `supabase-kbo-companies-migration.sql`)

`kbo_companies`: a name-search index over Belgian KBO Open Data (the public Crossroads Bank
for Enterprises register) — not written to by the app itself. `enterprise_number`,
`denomination`, `start_date`; only currently-active ("AC") enterprises are imported, one row
per denomination on file for them (legal name/abbreviation/commercial name, any language), so
a company can match on whichever name variant the user types. A `pg_trgm` GIN index backs
`search_kbo_companies(search_query, result_limit)`, a SQL function that ranks by trigram
similarity + prefix match (prefix matches get a `+1` score bonus so "Van D" surfaces "Van
Duyse..." before an unrelated short match like "VAN" — raw `similarity()` alone favors short
strings) and dedupes to one (best-matching) row per company. Public read policy
(`using (true)`) — it's non-sensitive government data and the signup page queries it before
the user has an account; `/api/company-search` is also listed in `proxy.ts`'s `isPublic`
allowlist for the same pre-session reason (easy to forget — it silently 401s otherwise, same
as `/api/signup-profile` needs to be). Read via `app/api/company-search` (GET `?q=`, calls the
RPC through `createAdminClient()`) and rendered by `components/CompanySearchInput.tsx`, a
search-as-you-type dropdown wired into the `companyName` field on `app/signup/page.tsx`;
picking a result also fills `profiles.company_number`, but the field stays free-typeable so a
company not yet in the KBO import can still be entered by hand.

**Populating it**: `scripts/import-kbo-companies.ts` is the one-off/manual path — point it at
an already-downloaded-and-extracted KBO export folder. `scripts/refresh-kbo-companies.ts` is
the unattended path: logs into kbopub.economie.fgov.be (`KBO_USERNAME`/`KBO_PASSWORD`,
reverse-engineered Spring Security form auth — see `scripts/lib/kboPortal.ts`'s header
comment), finds the newest "Full" export on the downloads listing (KBO actually publishes one
daily, despite the portal's own UI text suggesting monthly), downloads and extracts it
(shells out to PowerShell's `Expand-Archive` — Windows-only by design, see below), truncates
`kbo_companies` via the `truncate_kbo_companies()` RPC, and reimports — both scripts share
their CSV-parsing/import core (`scripts/lib/kboImport.ts`). Registered as a monthly Windows
Scheduled Task via `scripts/register-kbo-refresh-task.ps1` (same precedent as
`tenderproc_bosa_scraper`'s `register_windows_task.ps1`) — **remember to actually run the
registration script**, not just have it exist in the repo; the BOSA scraper's task sat
unregistered for days before anyone noticed (see the BOSA scraper project memory). Deliberately
not a Vercel cron: the extracted export is multiple GB, far past a serverless function's
`/tmp` and execution-time limits.

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
