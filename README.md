# TenderProc — Beta

An AI bid manager for Belgian SMEs, not just an "AI chatbot for tenders." The
AI does the heavy reading, extraction, matching, and (in later phases)
drafting and checking; the human stays responsible for the final bid and
submission. See `docs/architecture.md` for the full picture, `docs/ai.md` for
the AI provider abstraction, and `docs/database.md` for the schema.

Two ways tenders enter the app, on purpose:

- **Discovery** — Opportunities/Search/Market overview pull live notices from
  the EU's official TED database; nothing here is persisted beyond a
  lightweight match-score cache.
- **Bid preparation** — Tenders (`/my-tenders`) is for a tender PDF you
  upload: it's persisted, AI-analyzed into structured requirements and award
  criteria, and scored against your Company knowledge base (`/company`) for a
  Bid/No-Bid recommendation. From a ready tender, **Start Bid** opens the Bid
  workspace (`/bids`) — a requirement checklist where the AI finds relevant
  company evidence, drafts a grounded response, and flags any claim in that
  draft it can't verify against your evidence. From there, a pre-submission
  review checks the whole bid for gaps before you submit, and the outcome
  (won/lost/withdrawn) gets recorded for the record.

## What's in this beta

Seven pages (`components/PrimaryNav.tsx`), all behind real per-person accounts (email/password, via Supabase Auth):

- **Opportunities** (`/opportunities`) — tenders matched to your sectors/languages, via a live sidebar (`components/PreferencesSidebar.tsx`) for adjusting them after signup. Filtered to genuinely open calls for tender only — see the notice-type note below.
- **Workflow** (`/workflow`) — a pipeline board (screening → reviewing → applying → submitted → won/lost) for tenders you're pursuing. Add a tender from Opportunities, Search, or its detail page; move/remove it from the board.
- **Search** (`/search`) — ad-hoc lookups across all open Belgian tenders by keyword, CPV code, value range, or deadline range, independent of your saved sectors.
- **Market overview** (`/market`) — recently-awarded Belgian contracts (winner, value, buyer) pulled from TED's own contract-award notices, with simple top-winners/top-buyers rollups. A 90-day snapshot, not a full historical archive.
- Tender detail page with an AI eligibility check (paste tender text in, get a verdict + summary) — this specific feature is still paste-only; real PDF extraction (below) is a separate, newer pipeline.
- Match scores: every tender in Opportunities/Search (and the detail page) gets a `NN/100 — <label>` badge scored against your company profile (company name, address, size, sectors, and a free-text description — collected at signup, see below). Computed via one batched Claude call per page load (chunked to ~10 tenders per call so large result pages don't get truncated), cached per (user, tender, profile) in `tender_scores` so repeat views are free — see `lib/scoring.ts` and `lib/matchScoreCache.ts`.
- Daily email notifications: a scheduled job checks each user's sectors and emails a digest of anything newly published since the last check.
- **Company** (`/company`) — the knowledge base the AI is allowed to draw on: core profile, services, certifications (with an expiry-soon/expired badge), references, and supporting documents (uploaded to Supabase Storage). Nothing here is ever invented by the AI — see `docs/ai.md`'s hallucination-protection rules.
- **Tenders** (`/my-tenders`) — upload a tender PDF; it's text-extracted (`lib/documents/`), AI-analyzed into a summary, contract details, award criteria, and categorized requirements (`lib/ai/`), and — if a company profile exists — scored with a Bid/No-Bid recommendation. That recommendation now includes a **TenderProc Score** breakdown (capability fit, mandatory requirements, experience, geographic fit, financial eligibility, certification fit, competition, preparation effort, strategic value — each explained, "competition" always honestly marked unavailable since there's no competitor data source yet) and a **Why Not Bid?** list of specific, severity-rated disqualifying factors. A **Map Evidence to Requirements** button runs a tender-wide pass matching every requirement against your company evidence (VERIFIED/PARTIAL/MISSING/CONTRADICTED/NEEDS_REVIEW, with an overall coverage %) — before you've even started a bid. Processing happens synchronously within the upload request (can take up to ~60s for a long document); by the time the detail page loads, status is already `READY` or `FAILED`. A ready tender gets a **Start Bid** button.
- **Bids** (`/bids`) — the bid workspace. Starting a bid snapshots that tender's requirements into a per-bid checklist (`bid_requirements`) with progress bars per category, plus a **Documents** checklist snapshotted from the tender's extracted required-documents list — mark each ready manually or attach a real file. Each requirement has its own page: **Find Evidence** surfaces relevant company services/certifications/references (never a fabricated one — see `docs/ai.md`), pick which to use, **Generate Draft** writes a response grounded only in that evidence, then a second AI pass checks the draft for any claim it can't verify and flags it as an **Unsupported claim** — including on a draft you've hand-edited, via **Save & Re-check**. Accept a draft to mark its requirement complete; the bid's own status (Evaluation → … → Won/Lost/Withdrawn/No result) is a separate dropdown in the workspace header.
- **Pre-submission review** (`/bids/[id]/review`) — a compliance check before you submit: unanswered mandatory requirements and missing documents are counted as critical issues, unresolved unsupported claims and any AI-detected contradiction between two drafted responses as warnings, rolled into a compliance score and a READY/NOT READY banner. From there: download whatever documents you've uploaded, a link to the tender's official submission platform if one was captured, and **Mark as Submitted**. Afterward, record the outcome (won/lost/withdrawn/no result) — contract value and duration for a win, reason/winning bidder/price for a loss — stored for future win-rate tracking, not analyzed yet.

**Billing** (`/pricing`, `/billing`) — not one of the seven core pages (no `PrimaryNav` entry), but live: Free/Pro/Premium tiers via Paddle as Merchant of Record (hosted checkout and hosted customer portal — no card data ever touches this app). `/pricing` shows the three tiers with an Upgrade button once logged in; `/billing` shows the current plan, renewal date, a grace-period banner if a payment's failed, and a link to Paddle's portal to manage or cancel. Webhook handling (`app/api/billing/webhook/route.ts`, `lib/billing/webhookHandlers.ts`) verifies Paddle's signature, logs every event to `billing_webhook_events` before acting (idempotent on `paddle_event_id`), and is the sole writer of `subscriptions` — the DB, not the Paddle API, is what `lib/billing/tiers.ts`'s `getEffectiveTier()` reads for access control, including a grace period on `past_due` before a failed payment actually loses access. Downgrading (Premium→Pro, or → Free on cancellation) only blocks *creating new* tier-gated output going forward; anything already built stays visible, since visibility is a plain ownership check, not a tier check. `incumbent_screening`/`tender_forecasting` feature keys are pre-wired in `lib/billing/tiers.ts` for when those features (see the roadmap above) ship — they don't gate anything yet because nothing built there yet needs gating. On successful payment, `lib/odoo/client.ts` creates an Odoo invoice with no Odoo-side tax applied (Paddle already collects/remits VAT as Merchant of Record) — scaffolded and unit-tested, not yet wired to a live Odoo instance.

**Notice-type filtering**: TED's Belgian feed mixes genuinely open contract notices (`cn-*`) with already-awarded notices (`can-*`) and a few administrative types — about a third of an unfiltered feed turned out to be already-decided contracts in testing. Opportunities and Search filter to `cn-*`/`pin-cfc-*` (open calls) via `isOpenCallNotice()` in `lib/ted.ts`; Market overview deliberately targets the `can-*` notices that Opportunities excludes.

**Match scores are metadata-only**: the score/criteria are based on the notice's title, buyer, CPV codes, value, and deadline — not the full tender document, which TED's list view doesn't carry. `lib/scoring.ts`'s prompt is deliberately restricted to not invent specific legal/technical requirements it can't actually see; a document-grounded check is still available per-tender via "Check eligibility" (paste the real text in) on the detail page.

**Company profile is captured at signup** (`app/signup/page.tsx`): company name, address, size band, sectors, and a short description of what the business does. This project requires email confirmation, so there's no session yet when signup submits — the profile is written via a service-role route (`app/api/signup-profile/route.ts`) keyed to the newly-created user id, restricted to `insert` (not `upsert`) so it can only seed a fresh profile once and can never be replayed to overwrite one that already exists. Sectors/languages stay editable afterward via the Opportunities sidebar; there's currently no UI to edit company name/address/size/description post-signup.

## What's deliberately NOT in this beta (see the "next" list below)

- Below-threshold Belgian tenders (regional/municipal notices outside TED)
- A way to turn notifications off (every user with saved sectors gets the daily digest)
- Full historical market analytics (Market overview is a 90-day snapshot, not a paginated archive)
- Automatic claim-text splicing (unsupported claims are Dismissed or hand-edited, never auto-deleted) and a granular per-claim "attach evidence" mechanism
- Win-rate analytics/dashboards over recorded outcomes (the data's captured in `bid_outcomes`, nothing analyzes it yet) and bid-package ZIP bundling (Download Bid Package links to individually uploaded files)
- Automatic tender scraping/submission, OCR for scanned PDFs, DOCX/XLSX upload, a background job queue, an OpenAI provider — all explicitly deferred; see `docs/architecture.md`'s "What's deliberately not built yet"
- The rest of the larger "AI tender employee" roadmap beyond Increment 1: Compliance Matrix UI, Bid Effort Estimator breakdown, Tender Timeline, Clarification Questions, Buyer/Historical/Competitor Intelligence, Tender Forecasting, Outcome-learning insights, Company "Bid DNA," Consortium/subcontractor suggestions, automated multi-source tender Discovery — see `docs/architecture.md`'s "AI tender employee expansion" section

## Running it locally

1. Install [Node.js 20+](https://nodejs.org).
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in:
   - `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project's Settings > API (the URL is the bare project URL, no `/rest/v1/` suffix)
   - `SUPABASE_SERVICE_ROLE_KEY` — same Settings > API page. Server-only; the notification job uses it to read all profiles and bypass row-level security. Never expose this to the client.
   - `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — from [resend.com](https://resend.com), used to send the digest email. Without a verified sending domain, the sandbox `onboarding@resend.dev` address only delivers to your own Resend account email.
   - `CRON_SECRET` — any long random string; locks `/api/cron/notify` down to Vercel Cron (or you, manually, with the same header).
4. `npm run dev`, then open http://localhost:3000

The Supabase project needs:
- A `profiles` table: `id` (uuid, references `auth.users.id`), `sectors` (text array), `languages` (text array), `strict_language_filter` (boolean, default false — see `supabase-language-filter-migration.sql`; unlike `languages`, which only reorders which translated title shows, this actually excludes notices TED doesn't report as published in a selected language), `company_name` (text), `address` (text), `company_size` (text), `company_description` (text), `updated_at`, with RLS allowing each user to read/write their own row. All of `company_name`/`address`/`company_size`/`company_description` are collected at signup and feed the match-score prompt.
- A `notified_tenders` table (dedup ledger for the notification job — see `lib/supabase/admin.ts` and `app/api/cron/notify/route.ts`):
  ```sql
  create table public.notified_tenders (
    user_id uuid not null references auth.users(id) on delete cascade,
    publication_number text not null,
    notified_at timestamptz not null default now(),
    primary key (user_id, publication_number)
  );
  alter table public.notified_tenders enable row level security;
  -- No policies: only the service role (the cron job) touches this table.
  ```
- A `pipeline_items` table (Workflow board state):
  ```sql
  create table public.pipeline_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    publication_number text not null,
    stage text not null default 'screening',
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, publication_number)
  );
  alter table public.pipeline_items enable row level security;
  create policy "manage own pipeline items" on public.pipeline_items
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  ```

- A `tender_scores` table (match-score cache, keyed by a hash of the profile fields that feed the prompt — see `profileHash()` in `lib/scoring.ts`):
  ```sql
  create table public.tender_scores (
    user_id uuid not null references auth.users(id) on delete cascade,
    publication_number text not null,
    score int not null,
    summary text not null,
    criteria jsonb not null default '[]'::jsonb,
    profile_hash text not null,
    computed_at timestamptz not null default now(),
    primary key (user_id, publication_number)
  );
  alter table public.tender_scores enable row level security;
  create policy "manage own tender scores" on public.tender_scores
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  ```

If testers hit an error saving preferences in the sidebar or adding a tender to Workflow, check the relevant table's RLS policy first.

- The Company/Tenders knowledge-base tables (`companies`, `company_services`,
  `company_locations`, `company_documents`, `company_certifications`,
  `company_references`, `tenders`, `tender_documents`, `tender_requirements`,
  `tender_award_criteria`) and two private Storage buckets
  (`company-documents`, `tender-documents`) — full SQL is in
  `supabase-phase1-migration.sql` at the repo root; see `docs/database.md`
  for the column-by-column reference and RLS pattern.
- The bid workspace tables (`bids`, `bid_requirements`, `bid_responses`,
  `bid_evidence`, `bid_warnings`) — full SQL is in
  `supabase-phase2-migration.sql` at the repo root.
- The pre-submission review/submission/outcome tables (`bid_documents`,
  `bid_reviews`, `bid_outcomes`), a widened `bids.status` check constraint
  (adds `NO_RESULT`), and a private `bid-documents` Storage bucket — full SQL
  is in `supabase-phase3-migration.sql` at the repo root.
- Two new columns on `tenders` (`ai_scorecard_dimensions`, `ai_disqualifiers`)
  and the `tender_requirement_evidence`/`tender_requirement_evidence_items`
  tables for tender-level evidence mapping — full SQL is in
  `supabase-phase4-migration.sql` at the repo root.
- The billing tables (`subscriptions`, `billing_webhook_events`,
  `odoo_invoice_log`) — full SQL is in `supabase-phase5-billing-migration.sql`
  at the repo root. Billing is fully optional: with `PADDLE_API_KEY` unset,
  `/pricing` and `/billing` still render and every user is treated as Free
  (`rowToUserSubscription` defaults a missing row to Free rather than
  erroring). Fill in the Paddle/Odoo block in `.env.example` only once you
  have real sandbox credentials to test against.

## Testing & linting

```bash
npm run lint    # eslint . — flat config (eslint.config.mjs), Next 16 removed `next lint`
npm test        # vitest run — pure-function unit tests, no live API/DB calls
npx tsc --noEmit
```

Only `lib/ai/`'s JSON-parsing/validation logic is unit tested so far
(`tests/ai/*.test.ts`). Database-isolation and full end-to-end workflow
tests aren't automated yet — see `docs/architecture.md`.

## Deploying so testers can reach it

The easiest path is [Vercel](https://vercel.com), since this is a standard
Next.js app:

1. This folder is already a local git repo (`git init`, committed) — add a GitHub remote and push it: `git remote add origin <url> && git push -u origin master`.
2. Import the repo in Vercel.
3. Add the same environment variables from `.env.local` in the Vercel
   project settings.
4. Deploy — Vercel gives you a live URL automatically, and picks up the
   `vercel.json` cron schedule (daily, 07:00 UTC) for the notification job
   automatically. Vercel's Hobby plan caps cron jobs at once/day.
5. Share that URL with your beta testers; they sign up for their own account.
