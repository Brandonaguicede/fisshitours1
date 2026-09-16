-- Security fix: tour_locations was the only content table whose write
-- policy didn't check public.is_editor_or_admin() — it granted insert/
-- update/delete to the bare `authenticated` role with `using (true)`, so
-- any self-registered Supabase Auth user (public sign-up isn't disabled in
-- this project) could write to it even without a row in public.profiles.
-- Bring it in line with every other admin-managed table (boats, tours,
-- tour_packages, destinations, etc.).
drop policy if exists "Authenticated users manage tour locations" on public.tour_locations;

create policy "editor manage tour locations"
on public.tour_locations for all
to authenticated
using (public.is_editor_or_admin())
with check (public.is_editor_or_admin());
