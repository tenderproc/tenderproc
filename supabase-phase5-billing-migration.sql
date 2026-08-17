-- Paddle billing: tier state (source of truth for feature gating) and a
-- full webhook event log (Phase 5) --

-- One row per user. Defaults every user to FREE with no billing object at
-- all — Free is an app-side flag, never a Paddle subscription (per spec).
-- Only the service role (the webhook handler) ever writes to this table;
-- the checkout/portal routes only read paddle_customer_id.
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'FREE' check (tier in ('FREE','PRO','PREMIUM')),
  status text not null default 'active' check (status in ('active','trialing','past_due','paused','canceled')),
  paddle_customer_id text,
  paddle_subscription_id text unique,
  -- End of the currently-paid billing period. Still the right access
  -- boundary while status = 'past_due' (see grace_period_ends_at) since
  -- Paddle keeps retrying the charge against this same period.
  current_period_end timestamptz,
  -- Set when a subscription.past_due webhook lands; null once the payment
  -- recovers or the grace period elapses. lib/billing/tiers.ts reads this
  -- (not a hardcoded "N days from now") so it always reflects whatever
  -- Paddle's own dunning schedule actually did.
  grace_period_ends_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "read own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only the service role (webhook handler)
-- mutates this table, same pattern as notified_tenders in Phase 1.

-- Every inbound Paddle webhook, verified or not, handled or not — the
-- "hardest to reconstruct after the fact" data per the brief. Verification
-- failures are logged here too (processed = false, error set) rather than
-- just rejected, so a signing-secret misconfiguration is debuggable from
-- the DB instead of only from server logs.
create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paddle',
  paddle_event_id text,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  error text,
  received_at timestamptz not null default now()
);
alter table public.billing_webhook_events enable row level security;
-- No policies: service-role only, never read/written by any user session.
create unique index billing_webhook_events_paddle_event_id_idx
  on public.billing_webhook_events (paddle_event_id) where paddle_event_id is not null;

-- Odoo invoice creation outcome per Paddle transaction — lets the webhook
-- handler stay idempotent (don't double-invoice on a webhook retry) and
-- gives an operator something to check when "the payment worked but no
-- Odoo invoice appeared" comes up.
create table public.odoo_invoice_log (
  id uuid primary key default gen_random_uuid(),
  paddle_transaction_id text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  odoo_invoice_id integer,
  status text not null default 'pending' check (status in ('pending','created','failed')),
  error text,
  created_at timestamptz not null default now()
);
alter table public.odoo_invoice_log enable row level security;
-- No policies: service-role only.
