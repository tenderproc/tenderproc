-- Strict language filter for Opportunities --

-- Separate from the existing `profiles.languages` column, which only
-- reorders which translated title variant shows (see buildTitlePriority in
-- lib/ted.ts) and never hides a tender. This new column is an explicit
-- opt-in: when true, Opportunities excludes notices whose TED-reported
-- official-language doesn't match any of the user's selected languages,
-- instead of just prioritizing display. Defaults to false so existing
-- users keep today's "show everything" behavior until they turn it on.
alter table public.profiles
  add column strict_language_filter boolean not null default false;
