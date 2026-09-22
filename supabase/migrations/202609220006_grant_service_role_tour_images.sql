-- Same gap as 202609220002 (tour_inclusions), same root cause: both tables
-- were created together in 202608260002_tour_admin_structure.sql with
-- identical grants to anon/authenticated only, never service_role. Missed
-- this one when fixing tour_inclusions because tour_images.alt_text wasn't
-- in scope yet — translate-all-site-content's first real run against it
-- confirmed 0/43 rows translated with the same "permission denied for
-- table tour_images" this would produce.
grant select, insert, update, delete
  on table public.tour_images
  to service_role;
