# Tender Copilot — Beta

AI-assisted screening of Belgian public tenders for SMEs. Pulls live notices
from the EU's official TED database and uses Claude to give a plain-language
eligibility read on a given tender.

## What's in this beta

Four pages (`components/PrimaryNav.tsx`), all behind real per-person accounts (email/password, via Supabase Auth):

- **Opportunities** (`/opportunities`) — tenders matched to your sectors/languages, via a live sidebar (`components/PreferencesSidebar.tsx`) for adjusting them after signup. Filtered to genuinely open calls for tender only — see the notice-type note below.
- **Workflow** (`/workflow`) — a pipeline board (screening → reviewing → applying → submitted → won/lost) for tenders you're pursuing. Add a tender from Opportunities, Search, or its detail page; move/remove it from the board.
- **Search** (`/search`) — ad-hoc lookups across all open Belgian tenders by keyword, CPV code, value range, or deadline range, independent of your saved sectors.
- **Market overview** (`/market`) — recently-awarded Belgian contracts (winner, value, buyer) pulled from TED's own contract-award notices, with simple top-winners/top-buyers rollups. A 90-day snapshot, not a full historical archive.
- Tender detail page with an AI eligibility check (paste tender text in, get a verdict + summary).
- Match scores: every tender in Opportunities/Search (and the detail page) gets a `NN/100 — <label>` badge scored against your company profile (company name, address, size, sectors, and a free-text description — collected at signup, see below). Computed via one batched Claude call per page load (chunked to ~10 tenders per call so large result pages don't get truncated), cached per (user, tender, profile) in `tender_scores` so repeat views are free — see `lib/scoring.ts` and `lib/matchScoreCache.ts`.
- Daily email notifications: a scheduled job checks each user's sectors and emails a digest of anything newly published since the last check.

**Notice-type filtering**: TED's Belgian feed mixes genuinely open contract notices (`cn-*`) with already-awarded notices (`can-*`) and a few administrative types — about a third of an unfiltered feed turned out to be already-decided contracts in testing. Opportunities and Search filter to `cn-*`/`pin-cfc-*` (open calls) via `isOpenCallNotice()` in `lib/ted.ts`; Market overview deliberately targets the `can-*` notices that Opportunities excludes.

**Match scores are metadata-only**: the score/criteria are based on the notice's title, buyer, CPV codes, value, and deadline — not the full tender document, which TED's list view doesn't carry. `lib/scoring.ts`'s prompt is deliberately restricted to not invent specific legal/technical requirements it can't actually see; a document-grounded check is still available per-tender via "Check eligibility" (paste the real text in) on the detail page.

**Company profile is captured at signup** (`app/signup/page.tsx`): company name, address, size band, sectors, and a short description of what the business does. This project requires email confirmation, so there's no session yet when signup submits — the profile is written via a service-role route (`app/api/signup-profile/route.ts`) keyed to the newly-created user id, restricted to `insert` (not `upsert`) so it can only seed a fresh profile once and can never be replayed to overwrite one that already exists. Sectors/languages stay editable afterward via the Opportunities sidebar; there's currently no UI to edit company name/address/size/description post-signup.

## What's deliberately NOT in this beta (see the "next" list below)

- Below-threshold Belgian tenders (regional/municipal notices outside TED)
- Automatic PDF text extraction (you paste the tender text in for now)
- Payments/billing
- A way to turn notifications off (every user with saved sectors gets the daily digest)
- Full historical market analytics (Market overview is a 90-day snapshot, not a paginated archive)

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
- A `profiles` table: `id` (uuid, references `auth.users.id`), `sectors` (text array), `languages` (text array), `company_name` (text), `address` (text), `company_size` (text), `company_description` (text), `updated_at`, with RLS allowing each user to read/write their own row. All of `company_name`/`address`/`company_size`/`company_description` are collected at signup and feed the match-score prompt.
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

## Deploying so testers can reach it

The easiest path is [Vercel](https://vercel.com), since this is a standard
Next.js app:

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel.
3. Add the same environment variables from `.env.local` in the Vercel
   project settings.
4. Deploy — Vercel gives you a live URL automatically, and picks up the
   `vercel.json` cron schedule (daily, 07:00 UTC) for the notification job
   automatically. Vercel's Hobby plan caps cron jobs at once/day.
5. Share that URL with your beta testers; they sign up for their own account.
