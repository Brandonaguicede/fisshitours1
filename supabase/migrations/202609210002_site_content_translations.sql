-- Adds English (_en) columns for admin-authored content that today only
-- exists in Spanish. Unlike reviews (customer-authored, unknown source
-- language, so it needs quote_es AND quote_en) or site_settings' Hero/About
-- (already manually bilingual via .es/.en keys), everything below has always
-- had exactly ONE admin-editable field, and admins have always written it in
-- Spanish. So the original column stays the single Spanish source of truth
-- (admin forms keep editing it exactly as before, no workflow change) and we
-- only add the derived English side, which "Traducir todo el sitio" fills in
-- and the public site reads for English visitors.
--
-- Every _en column is backfilled with today's Spanish value (identical
-- behavior to right now, in both languages) until the translation function
-- actually runs — same safe pattern as reviews' quote_es/quote_en backfill.
--
-- Known limitation (accepted per product decision): if an admin edits the
-- Spanish source again after it was translated, the _en column is NOT
-- automatically invalidated — the button only fills gaps, it never
-- overwrites. Re-translating on edit is a deliberate non-goal for this pass.

-- tours -----------------------------------------------------------------
alter table public.tours
  add column if not exists title_en text,
  add column if not exists description_en text,
  add column if not exists long_description_en text,
  add column if not exists image_alt_en text,
  add column if not exists highlights_en jsonb not null default '[]'::jsonb,
  add column if not exists included_en jsonb not null default '[]'::jsonb;

update public.tours set
  title_en = coalesce(title_en, title),
  description_en = coalesce(description_en, description),
  long_description_en = coalesce(long_description_en, long_description),
  image_alt_en = coalesce(image_alt_en, image_alt),
  highlights_en = case when highlights_en = '[]'::jsonb then coalesce(highlights, '[]'::jsonb) else highlights_en end,
  included_en = case when included_en = '[]'::jsonb then coalesce(included, '[]'::jsonb) else included_en end;

-- title_en is intentionally left nullable, unlike tours.title (not null):
-- AdminToursPage's insert only sets `title` today, and this pass doesn't
-- touch that form, so a not-null title_en with no default would break
-- creating a new tour. Null here just means "not translated yet", same as
-- every other _en column added below.

-- tour_packages -----------------------------------------------------------
-- package_included is a native text[] (not jsonb, unlike tours.highlights/
-- included), so its English counterpart matches that type.
alter table public.tour_packages
  add column if not exists name_en text,
  add column if not exists description_en text,
  add column if not exists package_included_en text[];

update public.tour_packages set
  name_en = coalesce(name_en, name),
  description_en = coalesce(description_en, description),
  package_included_en = coalesce(package_included_en, package_included);

-- tour_inclusions -----------------------------------------------------------
alter table public.tour_inclusions
  add column if not exists label_en text;

update public.tour_inclusions set label_en = coalesce(label_en, label);

-- boats -----------------------------------------------------------------
alter table public.boats
  add column if not exists badge_en text,
  add column if not exists featured_spec_en text;

update public.boats set
  badge_en = coalesce(badge_en, badge),
  featured_spec_en = coalesce(featured_spec_en, featured_spec);

-- gallery_images -----------------------------------------------------------
alter table public.gallery_images
  add column if not exists title_en text,
  add column if not exists alt_en text;

update public.gallery_images set
  title_en = coalesce(title_en, title),
  alt_en = coalesce(alt_en, alt);

-- payment_methods -----------------------------------------------------------
alter table public.payment_methods
  add column if not exists description_en text,
  add column if not exists instructions_en text;

update public.payment_methods set
  description_en = coalesce(description_en, description),
  instructions_en = coalesce(instructions_en, instructions);

-- departure_locations -----------------------------------------------------------
alter table public.departure_locations
  add column if not exists description_en text;

update public.departure_locations set description_en = coalesce(description_en, description);
