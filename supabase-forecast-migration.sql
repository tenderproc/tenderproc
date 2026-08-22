-- Tender Forecast feature: adds duration/expiry forecasting columns to the
-- existing contract_awards table (see supabase-contract-awards-migration.sql).
-- No new table — an award's forecast is a property of the award itself, not
-- a separate concept, so it lives on the same row as the rest of the notice.

alter table public.contract_awards
  add column contract_duration_months integer,
  add column duration_confidence text not null default 'unknown'
    check (duration_confidence in ('confirmed', 'estimated', 'unknown')),
  add column estimated_expiry_date date;

-- Populated by app/api/cron/ingest-awards/route.ts (lib/forecast/expiry.ts's
-- computeEstimatedExpiry), same job that already writes the rest of the row.
-- 'confirmed' = TED published an explicit duration or end date for this
-- notice (lib/ted.ts's parseAwardDuration); 'estimated' = derived from the
-- CPV-prefix fallback table (lib/forecast/durationDefaults.ts) because TED
-- published nothing explicit; 'unknown' = neither available — never guessed,
-- per spec estimated_expiry_date stays null in that case.

create index on public.contract_awards (estimated_expiry_date);
