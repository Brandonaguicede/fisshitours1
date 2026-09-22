-- tour_inclusions was created in 202608260002_tour_admin_structure.sql
-- (well before this session's work) with SELECT/INSERT/UPDATE/DELETE
-- granted to anon/authenticated only — service_role was never granted
-- anything beyond the implicit REFERENCES/TRIGGER/TRUNCATE it gets on every
-- table. That's invisible to the normal admin flow (it uses the logged-in
-- user's own `authenticated` session, which already has the right grants),
-- but it blocks any service-role-based access, which translate-all-site-
-- content is the first thing to ever need for this table — it got
-- "permission denied for table tour_inclusions" and silently skipped every
-- row.
grant select, insert, update, delete
  on table public.tour_inclusions
  to service_role;
