-- Adds the missing Spanish (_es) side next to the _en columns added in
-- 202609210002. That migration assumed the legacy field was always
-- Spanish-authored (matching Hero/About's convention) and only derived
-- English from it. In production, tours/boats content turned out to be
-- written in English, not Spanish — so Spanish visitors were seeing
-- English tour titles, inclusions, boat specs, etc. This migration adds
-- the other side; a follow-up edge function change makes
-- translate-all-site-content fill EN->ES as well as ES->EN.
--
-- Bootstrap heuristic (avoids re-spending DeepL quota on content already
-- translated by the two runs so far): for each field, its _en column is
-- either (a) a real translation DeepL produced, which only happens when
-- the legacy value was NOT already English, or (b) byte-identical to the
-- legacy value, because DeepL's target-language translation of text
-- already in that language returns it unchanged. So:
--   legacy_en == legacy       -> legacy was English  -> _es stays NULL
--                                 (still needs a real ES translation)
--   legacy_en != legacy (set) -> legacy was Spanish   -> _es = legacy
--                                 (already the Spanish original, no
--                                 translation needed)
--   legacy_en is NULL          -> nothing was translated (empty source)
--                                 -> _es stays NULL too
-- This is a heuristic, not language detection — a false match is possible
-- in principle (e.g. a Spanish value that happens to be unchanged by
-- DeepL) but not destructive: worst case, translate-all-site-content
-- re-derives that one side on its next run, same as any other gap.

-- tours -----------------------------------------------------------------
alter table public.tours
  add column if not exists title_es text,
  add column if not exists description_es text,
  add column if not exists long_description_es text,
  add column if not exists image_alt_es text,
  add column if not exists highlights_es jsonb not null default '[]'::jsonb,
  add column if not exists included_es jsonb not null default '[]'::jsonb;

update public.tours set
  title_es = case when title_es is null and title_en is distinct from title then title else title_es end,
  description_es = case when description_es is null and description_en is distinct from description then description else description_es end,
  long_description_es = case when long_description_es is null and long_description_en is distinct from long_description then long_description else long_description_es end,
  image_alt_es = case when image_alt_es is null and image_alt_en is distinct from image_alt then image_alt else image_alt_es end,
  highlights_es = case when highlights_es = '[]'::jsonb and highlights_en is distinct from highlights then coalesce(highlights, '[]'::jsonb) else highlights_es end,
  included_es = case when included_es = '[]'::jsonb and included_en is distinct from included then coalesce(included, '[]'::jsonb) else included_es end;

-- tour_packages -----------------------------------------------------------
alter table public.tour_packages
  add column if not exists name_es text,
  add column if not exists description_es text,
  add column if not exists package_included_es text[];

update public.tour_packages set
  name_es = case when name_es is null and name_en is distinct from name then name else name_es end,
  description_es = case when description_es is null and description_en is distinct from description then description else description_es end,
  package_included_es = case when package_included_es is null and package_included_en is distinct from package_included then package_included else package_included_es end;

-- tour_inclusions -----------------------------------------------------------
alter table public.tour_inclusions
  add column if not exists label_es text;

update public.tour_inclusions set
  label_es = case when label_es is null and label_en is distinct from label then label else label_es end;

-- boats -----------------------------------------------------------------
alter table public.boats
  add column if not exists badge_es text,
  add column if not exists featured_spec_es text;

update public.boats set
  badge_es = case when badge_es is null and badge_en is distinct from badge then badge else badge_es end,
  featured_spec_es = case when featured_spec_es is null and featured_spec_en is distinct from featured_spec then featured_spec else featured_spec_es end;

-- gallery_images -----------------------------------------------------------
alter table public.gallery_images
  add column if not exists title_es text,
  add column if not exists alt_es text;

update public.gallery_images set
  title_es = case when title_es is null and title_en is distinct from title then title else title_es end,
  alt_es = case when alt_es is null and alt_en is distinct from alt then alt else alt_es end;

-- payment_methods -----------------------------------------------------------
alter table public.payment_methods
  add column if not exists description_es text,
  add column if not exists instructions_es text;

update public.payment_methods set
  description_es = case when description_es is null and description_en is distinct from description then description else description_es end,
  instructions_es = case when instructions_es is null and instructions_en is distinct from instructions then instructions else instructions_es end;

-- departure_locations -----------------------------------------------------------
alter table public.departure_locations
  add column if not exists description_es text;

update public.departure_locations set
  description_es = case when description_es is null and description_en is distinct from description then description else description_es end;
