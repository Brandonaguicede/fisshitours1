-- Boats get the same editorial state as Tours: publication_status is the source of truth
-- ('draft' | 'published' | 'inactive') and `active` is derived from it by a trigger, so every
-- place that already filters on boats.active (public site, booking RPCs, edge functions) keeps working.
--
--   draft     -> active = false  (borrador, not public)
--   published -> active = true   (activo)
--   inactive  -> active = false  (oculto)
--
-- Mirrors 202608260002_tour_admin_structure.sql (tours.publication_status +
-- sync_tour_active_from_publication_status). One addition for safety: the trigger also watches
-- `active`, so a write that only touches boats.active (SQL editor, table editor, an old script) can
-- never leave the two columns disagreeing — after any write, active = (publication_status = 'published').
-- Nothing else changes.

alter table public.boats
  add column if not exists publication_status text not null default 'published'
    check (publication_status in ('draft', 'published', 'inactive'));

-- Existing boats keep the decision they already had: active -> published, inactive -> inactive.
-- Inactive boats are NOT reinterpreted as drafts. The filter makes this safe to re-run: it only
-- touches rows still carrying the column default, never a boat already saved as a draft.
update public.boats
  set publication_status = 'inactive'
  where publication_status = 'published' and active = false;

create or replace function public.sync_boat_active_from_publication_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- publication_status wins. The column default is 'published', so a row inserted with only
    -- `active = false` (no status) means "hidden" and becomes inactive, never a visible boat.
    if new.publication_status = 'published' and new.active is false then
      new.publication_status = 'inactive';
    end if;
  elsif new.publication_status is distinct from old.publication_status then
    null; -- the status was edited: it wins, `active` is derived below
  elsif new.active is distinct from old.active then
    -- Only `active` was written: keep publication_status coherent (a draft stays a draft when hidden).
    new.publication_status = case
      when new.active then 'published'
      when old.publication_status = 'draft' then 'draft'
      else 'inactive'
    end;
  end if;
  new.active = new.publication_status = 'published';
  return new;
end;
$$;

drop trigger if exists boats_sync_publication_status on public.boats;
create trigger boats_sync_publication_status
before insert or update of publication_status, active
on public.boats
for each row
execute function public.sync_boat_active_from_publication_status();
