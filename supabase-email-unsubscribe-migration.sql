-- Lets a user opt out of the automated notification emails (the daily
-- "new tenders" digest and the beta-feedback day-7/30/90 reminder, see
-- lib/email.ts) via the one-click unsubscribe link now included in their
-- footer (lib/unsubscribe.ts, app/api/unsubscribe/route.ts). Defaults to
-- true so existing users keep receiving what they already get today until
-- they explicitly opt out.
alter table public.profiles
  add column email_notifications_enabled boolean not null default true;
