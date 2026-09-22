-- Fixes a real bug in 202609210002_site_content_translations.sql (NOT
-- edited here — it's already applied in production, so this migration
-- corrects its effect instead): that migration's backfill copied every
-- Spanish value straight into its new _en column ("title_en = coalesce(
-- title_en, title)"), which made every _en field non-empty from the start.
-- translate-all-site-content only translates a field when its _en side is
-- empty ("destino vacío = traducir"), so every single row in every table
-- below was permanently skipped — DeepL was never actually called.
--
-- This resets each _en column back to "not yet translated" (NULL, or
-- '[]'::jsonb for the two NOT NULL jsonb array columns that default to it)
-- — but ONLY where it's still byte-for-byte identical to the original
-- field, i.e. only the artificial backfill copies. Any _en value that has
-- since been edited to something different is left untouched; there are
-- none yet (this runs before translate-all-site-content ever successfully
-- translated anything), but the WHERE clause makes that true going forward
-- too, not just today.

-- tours -----------------------------------------------------------------
update public.tours set title_en = null where title_en = title;
update public.tours set description_en = null where description_en = description;
update public.tours set long_description_en = null where long_description_en = long_description;
update public.tours set image_alt_en = null where image_alt_en = image_alt;
update public.tours set highlights_en = '[]'::jsonb where highlights_en = highlights;
update public.tours set included_en = '[]'::jsonb where included_en = included;

-- tour_packages -----------------------------------------------------------
update public.tour_packages set name_en = null where name_en = name;
update public.tour_packages set description_en = null where description_en = description;
update public.tour_packages set package_included_en = null where package_included_en = package_included;

-- tour_inclusions -----------------------------------------------------------
update public.tour_inclusions set label_en = null where label_en = label;

-- boats -----------------------------------------------------------------
update public.boats set badge_en = null where badge_en = badge;
update public.boats set featured_spec_en = null where featured_spec_en = featured_spec;

-- gallery_images -----------------------------------------------------------
update public.gallery_images set title_en = null where title_en = title;
update public.gallery_images set alt_en = null where alt_en = alt;

-- payment_methods -----------------------------------------------------------
update public.payment_methods set description_en = null where description_en = description;
update public.payment_methods set instructions_en = null where instructions_en = instructions;

-- departure_locations -----------------------------------------------------------
update public.departure_locations set description_en = null where description_en = description;
