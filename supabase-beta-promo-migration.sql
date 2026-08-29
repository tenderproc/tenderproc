-- Beta feedback promo: first 20 Pro/Premium subscribers get 50% off for 6
-- months (enforced by a Paddle discount with recur + maximumRecurringIntervals
-- + usageLimit — see scripts/setup-beta-promo-discount.ts) in exchange for
-- feedback at day 7/30/90. These tables track what Paddle's discount object
-- itself cannot: per-customer dedup (Paddle's usage_limit is global-only)
-- and blocking a cancel-then-resubscribe reset, plus the actual feedback
-- responses. Same convention as supabase-phase5-billing-migration.sql:
-- service-role-only, RLS enabled, no broad policies.

create table public.beta_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check (tier in ('PRO','PREMIUM')),
  status text not null default 'reserved' check (status in ('reserved','confirmed','expired')),
  paddle_discount_id text,
  paddle_subscription_id text,
  reserved_at timestamptz not null default now(),
  reservation_expires_at timestamptz not null,
  confirmed_at timestamptz,
  promo_end_date timestamptz,
  email_day7_sent_at timestamptz,
  email_day30_sent_at timestamptz,
  email_day90_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.beta_promo_redemptions enable row level security;

-- One CONFIRMED redemption ever per user (blocks cancel/resubscribe abuse —
-- the row survives cancellation, so a repeat attempt is rejected even
-- though the underlying Paddle subscription is gone). One active RESERVED
-- row per user at a time (a second checkout attempt can't double-reserve).
create unique index beta_promo_redemptions_user_confirmed_idx
  on public.beta_promo_redemptions (user_id) where status = 'confirmed';
create unique index beta_promo_redemptions_user_reserved_idx
  on public.beta_promo_redemptions (user_id) where status = 'reserved';

create table public.beta_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references public.beta_promo_redemptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone smallint not null check (milestone in (7,30,90)),
  rating smallint,
  comments text,
  dismissed boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (redemption_id, milestone)
);
alter table public.beta_feedback_responses enable row level security;

-- Atomically reserves one of the 20 promo slots for a user, in a single
-- transaction (LOCK TABLE serializes concurrent callers so two requests
-- can't both read "19 taken" and both insert the 20th+21st row). Raises
-- 'already_redeemed' (P0001) or 'promo_full' (P0002) as plain exceptions —
-- callers (lib/billing/betaPromo.ts) catch these by message, not errcode,
-- since PostgREST's RPC error surface loses the errcode by the time it
-- reaches the JS client.
create or replace function public.reserve_beta_promo_slot(p_user_id uuid, p_tier text)
returns table (id uuid, remaining int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ttl interval := '30 minutes';
  v_id uuid;
  v_count int;
begin
  lock table public.beta_promo_redemptions in share row exclusive mode;

  update public.beta_promo_redemptions
    set status = 'expired'
    where user_id = p_user_id and status = 'reserved' and reservation_expires_at < now();

  if exists (
    select 1 from public.beta_promo_redemptions
    where user_id = p_user_id and status in ('reserved','confirmed')
  ) then
    raise exception 'already_redeemed';
  end if;

  select count(*) into v_count from public.beta_promo_redemptions
    where status = 'confirmed'
       or (status = 'reserved' and reservation_expires_at >= now());
  if v_count >= 20 then
    raise exception 'promo_full';
  end if;

  insert into public.beta_promo_redemptions (user_id, tier, reservation_expires_at)
    values (p_user_id, p_tier, now() + v_ttl)
    returning beta_promo_redemptions.id into v_id;

  return query select v_id, (20 - v_count - 1);
end;
$$;
