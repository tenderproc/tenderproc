-- Collapses the old `languages text[]` display-priority list into one
-- exclusive single-select column. (The strict_language_filter toggle
-- referenced in the original supabase-language-filter-migration.sql was
-- never actually applied to this database, confirmed via a live schema
-- check — so no user's results were ever actually being filtered by
-- language; `languages` was purely cosmetic. This backfill just carries
-- forward a user's single explicit pick, if they had exactly one.)
-- See components/PreferencesSidebar.tsx and app/opportunities/page.tsx.
--
-- `language` is nullable: null means "All languages". A non-null value is
-- a single lib/languages.ts key (nl/fr/de/en) that both filters results
-- to that language and sets it as the preferred display language.

alter table public.profiles add column language text null;

update public.profiles
set language = languages[1]
where array_length(languages, 1) = 1;

alter table public.profiles drop column languages;
