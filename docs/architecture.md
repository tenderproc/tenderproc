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
  `tender_award_criteria`), goes through the AI pipeline described below, and is the
  foundation the Phase 2 bid workspace will build on.

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
is the factory. Only PDF is implemented (`pdf-extractor.ts`, built on the existing
`pdf-parse` dependency), with a custom `pagerender` callback that prefixes each page with a
`--- PAGE n ---` marker so the AI can cite approximate source pages. A PDF whose extracted
text is near-empty (e.g. a scanned document with no text layer) fails cleanly rather than
being silently analyzed on nothing — OCR is out of scope for this phase.

Adding DOCX/XLSX later means adding another `DocumentExtractor` implementation and a branch
in `getExtractor()` — no other code changes.

## AI provider abstraction

See `docs/ai.md`.

## Folder layout

```
app/
  api/{analyze,cron/notify,signup-profile,tenders/upload}/route.ts
  {opportunities,search,market,workflow,pricing,my-tenders,company}/page.tsx
  my-tenders/[tenderId]/page.tsx
  tenders/[id]/page.tsx        # TED lookup — unrelated to /my-tenders
components/
  {tenders,company}/           # new, feature-scoped
  ...                          # existing shared components
lib/
  ai/                          # provider abstraction (types, prompts, provider, anthropic-provider, index)
  documents/                   # PDF extraction abstraction
  company/                     # company-knowledge-base read helper
  supabase/                    # client/server/admin Supabase clients
  ted.ts, scoring.ts, matchScoreCache.ts, sectors.ts, languages.ts, workflow.ts, email.ts, types.ts
tests/
  ai/parsers.test.ts           # pure-function unit tests (no network/DB)
```

## What's deliberately not built yet

- Bid workspace / `bids`, `bid_requirements`, `bid_responses`, `bid_evidence`,
  `bid_warnings`, `bid_reviews`, `bid_outcomes` tables — Phase 2.
- Pre-submission compliance review — Phase 3.
- A background job queue for upload processing (see above).
- OCR for scanned PDFs.
- DOCX/XLSX extraction.
- An OpenAI provider (the abstraction supports adding one; nothing calls for it yet).
- Automated DB-isolation / full end-to-end workflow tests (would need live 2-user Supabase
  fixtures) — only pure-function parsing/validation logic is unit tested this round.
