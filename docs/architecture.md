# Architecture

Tender Copilot is a Next.js 16 App Router app, TypeScript throughout, Tailwind for styling,
Supabase for Postgres + Auth + Storage. There is no separate backend — server-side logic
lives in Server Components, Route Handlers (`app/api/**/route.ts`), and `lib/`.

## Two tender concepts, by design

The app has two independent ways a tender enters it, and they deliberately don't share a
data model:

- **Opportunities / Search / Market overview** (`app/opportunities`, `app/search`,
  `app/market`) — live, ephemeral results pulled straight from the EU's TED API
  (`lib/ted.ts`) on every page load. Nothing is persisted to the database except a
  lightweight AI match-score cache (`tender_scores`) and the kanban-style `pipeline_items`
  someone explicitly tracks via **Workflow**.
- **Tenders** (`app/my-tenders`) — a tender the user has uploaded as a PDF. This is
  persisted (`tenders`, `tender_documents`, `tender_requirements`,
  `tender_award_criteria`), goes through the AI pipeline described below, and is what a
  **Bid** (`app/bids`, Phase 2) is created from.

They're routed separately on purpose: `/tenders/[id]` already means "look up this TED
notice by publication number" and was not repurposed. The uploaded-tender feature lives at
`/my-tenders` instead. A future phase could add an "Import as Bid Tender" action bridging
the two, but that doesn't exist yet.

## Company knowledge base vs. `profiles`

`profiles` (one row per user) predates this expansion and powers the TED match-scoring
feature — it holds `sectors`/`languages`/`company_name`/`address`/`company_size`/
`company_description`, all collected at signup.

`companies` (+ `company_services`, `company_locations`, `company_documents`,
`company_certifications`, `company_references`) is the new, richer knowledge base managed
at `/company`. It is the *only* source of company facts the AI is allowed to use when
generating a Bid/No-Bid recommendation (see `docs/ai.md`).

These two overlap in a few fields (name, size, description). That's accepted, intentional
duplication for Phase 1 rather than migrating `profiles` — it keeps the already-working TED
scoring feature untouched. A future phase could consolidate them.

## Upload → analysis pipeline

`app/api/tenders/upload/route.ts` runs synchronously within one request:

1. Validate + store the PDF in Supabase Storage (`tender-documents` bucket, private,
   path-prefixed by `user_id`).
2. Extract text via `lib/documents/` (see below).
3. Call `AIProvider.analyzeTender()` → persist `tenders` contract fields,
   `tender_requirements`, `tender_award_criteria`.
4. If a `companies` row exists, call `AIProvider.generateBidRecommendation()` → persist
   score/label/recommendation onto the `tenders` row. Skipped (not failed) if there's no
   company profile yet — the detail page prompts the user to add one instead.
5. Mark `tenders.status = READY` (or `FAILED` at whichever step broke).

Because the client `fetch()` awaits this whole request, by the time
`/my-tenders/[tenderId]` renders, status is already terminal — there's no polling. The
`status` column (`PROCESSING/ANALYZING/READY/FAILED`) exists specifically so a real queue
(e.g. process the upload in a background job, update status via webhook) can replace step
2–5 later without a schema change. `maxDuration = 60` is set on the route since a large PDF
+ two AI calls can take a while on Vercel.

## Document processing (`lib/documents/`)

`DocumentExtractor` is a one-method interface (`extractText(buffer)`); `getExtractor(mimeType)`
is the factory. Only PDF is implemented (`pdf-extractor.ts`), on top of `unpdf` — each page's
text is prefixed with a `--- PAGE n ---` marker so the AI can cite approximate source pages.
A PDF whose extracted text is near-empty (e.g. a scanned document with no text layer) fails
cleanly rather than being silently analyzed on nothing — OCR is out of scope for this phase.

**Library choice**: Phase 1 originally used `pdf-parse` (bundles a frozen ~2018 pdf.js
build, dynamically `require()`d by path/version). It parsed test PDFs correctly in a
standalone Node script and worked once during initial manual testing, but during Phase 2
verification it became **consistently unreliable specifically when invoked from inside this
app's Next.js server process** — the exact same, byte-verified-valid PDF (confirmed via
SHA-256 across the whole request path) threw a different pdf.js internal error
("bad XRef entry", "Command token too long") on nearly every attempt, reproducible across
`next dev` and `next build && next start`, with `.next` cleared and every Node process
killed between attempts, independent of the specific PDF used (tried a hand-built one and a
`pdf-lib`-generated one — both failed the same way in-server, both parsed cleanly
standalone). None of Node version, `serverExternalPackages` bundling exclusion, or a fresh
`require.cache`-busted reload changed the outcome. Switching to `unpdf` (a maintained
wrapper around Mozilla's current, actively-supported pdf.js, purpose-built for Node/
serverless use) resolved it immediately and has been reliable since. `pdf-parse` and
`@types/pdf-parse` are no longer a dependency.

Adding DOCX/XLSX later means adding another `DocumentExtractor` implementation and a branch
in `getExtractor()` — no other code changes.

## AI provider abstraction

See `docs/ai.md`.

## Bid workspace (Phase 2)

A **Bid** (`bids` table) is created from a `READY` tender via "Start Bid"
(`components/tenders/StartBidButton.tsx` → `POST /api/bids`), which snapshots that tender's
`tender_requirements` into `bid_requirements` — a per-bid copy, not a live reference, so the
checklist doesn't shift if the tender were ever re-analyzed. One bid per tender
(`bids.tender_id` is `unique`); starting again from the same tender just links back to the
existing bid.

The workspace (`app/bids/[bidId]/page.tsx`) shows progress bars computed per requirement
category actually present in that bid (`lib/bids.ts`'s `computeProgress()`:
`(COMPLETE + NOT_APPLICABLE) / total`), not a hardcoded category list — the spec's example
categories are illustrative, and a real bid may not have requirements in all of them. Each
requirement links to its own page (`app/bids/[bidId]/requirements/[reqId]/page.tsx`) where
the evidence → draft → validate flow happens (see `docs/ai.md`).

Status changes (bid status dropdown, marking a requirement `NOT_APPLICABLE`/`BLOCKED`,
accepting a draft, dismissing a warning) are all plain Supabase client calls from Client
Components followed by `router.refresh()` — the same pattern `WorkflowBoard.tsx` already
used, reused rather than introducing API routes for state that doesn't touch the AI.

## Pre-submission review, submission, outcomes (Phase 3)

`app/bids/[bidId]/review/page.tsx` is a new page, not a section of the workspace — running
a review and acting on it (download/submit/mark-submitted) is a distinct step from working
requirements, so it gets its own URL. Running the review (`RunReviewButton` →
`POST /api/bids/[bidId]/review`) computes `requirements_total/complete`,
`documents_total/ready`, and `critical_issues` deterministically from `bid_requirements`/
`bid_documents`/`bid_warnings` rows, calls `AIProvider.runComplianceReview()` only for
cross-response contradictions (see `docs/ai.md`), and persists the whole result as a new
`bid_reviews` row — a point-in-time snapshot, not a live view, so the page always shows the
*last run* result until the user explicitly re-runs it.

`bid_documents` fills a gap the required-documents list had since Phase 1: `analyzeTender`
already extracts `requiredDocuments: string[]`, but it only ever lived inside the
`tenders.ai_analysis` jsonb blob, un-normalized. `POST /api/bids` now also snapshots that
array into row-per-document `bid_documents` at bid-creation time (same snapshot pattern as
`bid_requirements`), so each one can be tracked (`MISSING`/`READY`) and optionally have a
real file attached (`bid-documents` Storage bucket, same `{user_id}/...`-prefixed RLS
pattern as the other two buckets) — from the bid workspace page, not just at review time, so
gaps can be closed incrementally rather than only discovered at the end.

Submission itself is never automated — the review page's "Submission" section is
**Download Bid Package** (signed-URL links to whatever's been uploaded to `bid_documents`,
no zip bundling), **Open Official Submission Platform** (`tenders.source_url` if one was
captured; plain text otherwise, since most manually-uploaded tenders won't have one), and
**Mark as Submitted** (`bids.status = 'SUBMITTED'`). The button isn't technically blocked by
open critical issues — the NOT READY TO SUBMIT banner is advisory, not a gate, matching the
rest of the app's philosophy that the human makes the final call.

Outcome tracking (`RecordOutcomeForm` on the bid workspace page) upserts `bid_outcomes` and
sets `bids.status` to the matching value in the same client-side action — no API route,
since it's a plain field write with no AI/secret involved, same as the existing
`BidStatusSelect` pattern. `bids.status`'s check constraint was widened in the Phase 3
migration to add `NO_RESULT` alongside the pre-existing `WON/LOST/WITHDRAWN`.

## Folder layout

```
app/
  api/{analyze,cron/notify,signup-profile,tenders/upload,bids}/route.ts
  api/bids/[bidId]/requirements/[reqId]/{find-evidence,generate-draft,recheck}/route.ts
  api/bids/[bidId]/review/route.ts
  {opportunities,search,market,workflow,pricing,my-tenders,company,bids}/page.tsx
  my-tenders/[tenderId]/page.tsx
  bids/[bidId]/page.tsx
  bids/[bidId]/requirements/[reqId]/page.tsx
  bids/[bidId]/review/page.tsx
  tenders/[id]/page.tsx        # TED lookup — unrelated to /my-tenders
components/
  {tenders,company,bids}/      # feature-scoped
  ...                          # existing shared components
lib/
  ai/                          # provider abstraction (types, prompts, provider, anthropic-provider, index)
  documents/                   # PDF extraction abstraction
  company/                     # knowledge.ts (AI-facing read) + evidence.ts (evidence lookup by id)
  supabase/                    # client/server/admin Supabase clients
  bids.ts                      # bid status list, progress calculation
  ted.ts, scoring.ts, matchScoreCache.ts, sectors.ts, languages.ts, workflow.ts, email.ts, types.ts
tests/
  ai/*.test.ts                 # pure-function unit tests (no network/DB)
```

## What's deliberately not built yet

- Automatic claim-text splicing — "unsupported claim" actions are Dismiss (mark it reviewed)
  or manually edit the draft; the spec itself says never auto-delete a claim.
- A granular "attach evidence to this specific claim" mechanism — use Find Evidence +
  (Re)generate with more evidence selected instead.
- A background job queue for upload/draft processing (see above).
- OCR for scanned PDFs.
- DOCX/XLSX extraction.
- An OpenAI provider (the abstraction supports adding one; nothing calls for it yet).
- Automated DB-isolation / full end-to-end workflow tests (would need live 2-user Supabase
  fixtures) — only pure-function parsing/validation logic is unit tested this round.
