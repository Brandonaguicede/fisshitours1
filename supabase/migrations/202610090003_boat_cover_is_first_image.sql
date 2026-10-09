-- A boat's cover is the FIRST photo of its gallery (Foto 1). boat_images.is_primary used to be written independently by the Admin (set on the first
-- upload, moved by hand when a photo was deleted, with the move failing silently against boat_images_one_primary_active), so it drifted: several
-- boats ended up with Foto 2 flagged as "Portada" and the public site showed that photo. The flag is now DERIVED from the gallery order and kept in
-- step by a trigger, so there is a single rule: first active image by (sort_order, created_at, id) = cover.

create or replace function public.sync_boat_cover(p_boat_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first uuid;
begin
  select id into v_first
    from public.boat_images
    where boat_id = p_boat_id and active
    order by sort_order, created_at, id
    limit 1;

  -- Clear first, then set: boat_images_one_primary_active allows a single active primary per boat.
  update public.boat_images
    set is_primary = false
    where boat_id = p_boat_id and is_primary and (v_first is null or id <> v_first);

  if v_first is not null then
    update public.boat_images set is_primary = true where id = v_first and not is_primary;
  end if;
end;
$$;

create or replace function public.boat_images_sync_cover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The corrections below are themselves updates of boat_images: do not react to our own writes.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_boat_cover(new.boat_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.boat_id is distinct from new.boat_id) then
    perform public.sync_boat_cover(old.boat_id);
  end if;
  return null;
end;
$$;

revoke all on function public.sync_boat_cover(text) from public;
revoke all on function public.boat_images_sync_cover() from public;

drop trigger if exists boat_images_sync_cover on public.boat_images;
create trigger boat_images_sync_cover
  after insert or delete or update of sort_order, active, boat_id, created_at, is_primary on public.boat_images
  for each row execute function public.boat_images_sync_cover();

-- Existing galleries: make the flag agree with the order (this is what moves "Portada" off Foto 2).
do $$
declare
  v_boat text;
begin
  for v_boat in select distinct boat_id from public.boat_images loop
    perform public.sync_boat_cover(v_boat);
  end loop;
end;
$$;
