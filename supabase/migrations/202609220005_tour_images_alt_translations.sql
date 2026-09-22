-- tour_images.alt_text (per-photo caption/accessibility text) had no
-- bilingual counterpart at all. Adds alt_text_es/alt_text_en, both left
-- NULL — "Traducir todo el sitio" fills both from the original text (this
-- table never had an _en-only column to bootstrap from, unlike the other
-- content tables in 202609210002/202609220003).
alter table public.tour_images
  add column if not exists alt_text_es text,
  add column if not exists alt_text_en text;
