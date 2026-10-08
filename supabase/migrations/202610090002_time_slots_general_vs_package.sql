-- Departure hours: general catalog vs package-specific hours, one canonical order, real create / edit / delete of the general hours.
--
-- MODEL
--   time_slots is the registry every bookable hour must live in (bookings.time_slot_id and availability_blocks.time_slot_id are FKs to it, and the
--   overlap / buffer / operating-hours triggers, the Admin list, Calendar and the emails read starts_at through it).
--   time_slots.is_general says whether the hour belongs to the SHARED catalog ("horarios generales"):
--     * is_general = true   -> offered to every package that uses the general hours (tour_packages.departure_times IS NULL);
--     * is_general = false  -> a package-specific hour: registered so it can be booked, but inherited by nobody.
--   A package with its own list (departure_times) offers exactly those hours, general or not. Adding an hour to ONE package never changes the catalog.
--
-- ROOT CAUSES this fixes
--   1. Order: every reader used `order by sort_order`, but the seeded hours have sort_order 1..4 while hours created from the package editor got
--      minutes-since-midnight, so 7:00 / 11:30 / 3:30 PM / 6:30 PM were listed before 2:00 AM / 6:00 AM. sort_order is now DERIVED from the hour
--      (trigger) and readers order by starts_at. Nobody maintains it by hand.
--   2. The package trigger promoted every package hour into the shared catalog (no is_general), and there was no way to edit or delete a shared hour,
--      so test / old hours (e.g. 2:00 AM) stayed offered to every package that inherits.
--   3. One slot per hour (unique index): "08:00" and "8:00 AM" can never become two hours.
--
-- Existing hours all become general (that is what they were until now); production has no bookings to preserve.

alter table public.time_slots add column if not exists is_general boolean not null default false;
update public.time_slots set is_general = true; -- everything that exists today is part of the shared catalog

-- Canonical order, derived from the hour
create or replace function public.time_slots_sync_sort_order()
returns trigger language plpgsql set search_path = public as $$
begin
  new.sort_order := extract(hour from new.starts_at)::int * 60 + extract(minute from new.starts_at)::int;
  return new;
end;
$$;
drop trigger if exists time_slots_sort_order on public.time_slots;
create trigger time_slots_sort_order
before insert or update of starts_at, sort_order on public.time_slots
for each row execute function public.time_slots_sync_sort_order();
update public.time_slots set sort_order = sort_order; -- fires the trigger: backfills every existing row

create unique index if not exists time_slots_starts_at_key on public.time_slots (starts_at);

-- A package's own hour is registered, not promoted (see the model above).
create or replace function public.prepare_package_settings()
returns trigger language plpgsql set search_path = public as $$
declare
  departure text;
  option_value jsonb;
  resolved_id text;
  normalized_times text[];
begin
  if jsonb_typeof(new.meal_options) <> 'array' or jsonb_array_length(new.meal_options) > 30 then
    raise exception 'Las comidas deben ser una lista de hasta 30 opciones.' using errcode = '22023';
  end if;
  for option_value in select value from jsonb_array_elements(new.meal_options) loop
    if jsonb_typeof(option_value) <> 'object'
      or jsonb_typeof(option_value -> 'es') is distinct from 'string'
      or jsonb_typeof(option_value -> 'en') is distinct from 'string'
      or length(btrim(option_value ->> 'es')) not between 1 and 120
      or length(btrim(option_value ->> 'en')) not between 1 and 120 then
      raise exception 'Cada comida necesita nombre en español e inglés (máximo 120 caracteres).' using errcode = '22023';
    end if;
  end loop;
  if new.package_included is not null then
    if cardinality(new.package_included) > 50 or exists (
      select 1 from unnest(new.package_included) item where item is null or length(btrim(item)) not between 1 and 300
    ) then
      raise exception 'Revisa los elementos incluidos en el paquete.' using errcode = '22023';
    end if;
  end if;
  if new.departure_times is null then return new; end if;
  if cardinality(new.departure_times) > 48 then
    raise exception 'El paquete admite hasta 48 horarios.' using errcode = '22023';
  end if;
  foreach departure in array new.departure_times loop
    if departure is null or departure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'La hora debe tener formato HH:MM de 24 horas.' using errcode = '22023';
    end if;
  end loop;
  -- Sorted locks prevent deadlocks when editors add the same hours concurrently.
  select coalesce(array_agg(distinct item order by item), '{}'::text[]) into normalized_times from unnest(new.departure_times) item;
  foreach departure in array normalized_times loop
    perform pg_advisory_xact_lock(hashtextextended('package-departure-' || departure, 0));
    select id into resolved_id from public.time_slots where starts_at = departure::time
      order by active desc, sort_order, id limit 1;
    if resolved_id is null then
      -- A package's own hour is REGISTERED (bookings / blocks / triggers need a time_slots row) but it is NOT promoted to the shared catalog:
      -- is_general stays false, so no other package inherits it. sort_order is derived from the hour by a trigger.
      insert into public.time_slots(id, label, starts_at, active, is_general)
      values ('departure-' || replace(departure, ':', ''), departure, departure::time, true, false);
    else
      update public.time_slots set active = true where id = resolved_id and not active;
    end if;
  end loop;
  new.departure_times := normalized_times;
  return new;
end;
$$;

-- Bookings: a package that inherits accepts only general hours; one with its own list accepts exactly its own hours.
create or replace function public.validate_booking_package_settings()
returns trigger language plpgsql set search_path = public as $$
declare
  package_row public.tour_packages%rowtype;
  slot_time text;
  slot_active boolean;
  slot_general boolean;
  validate_time boolean := true;
  validate_meal boolean := true;
begin
  if tg_op = 'UPDATE' then
    validate_time := new.tour_package_id is distinct from old.tour_package_id or new.time_slot_id is distinct from old.time_slot_id or new.tour_date is distinct from old.tour_date or new.boat_id is distinct from old.boat_id;
    validate_meal := new.tour_package_id is distinct from old.tour_package_id or new.meal_option is distinct from old.meal_option;
  end if;
  if not validate_time and not validate_meal then return new; end if;
  select * into package_row from public.tour_packages where id = new.tour_package_id;
  if package_row.id is null then raise exception 'Tour package not found' using errcode = '22023'; end if;
  if validate_time then
    select to_char(starts_at, 'HH24:MI'), active, is_general into slot_time, slot_active, slot_general from public.time_slots where id = new.time_slot_id;
    -- A package with its own list accepts exactly those hours; a package that inherits accepts only hours of the shared (general) catalog.
    if slot_time is null or not slot_active
       or (package_row.departure_times is not null and not (slot_time = any(package_row.departure_times)))
       or (package_row.departure_times is null and not slot_general) then
      raise exception 'La hora seleccionada no está disponible para este paquete.' using errcode = '22023';
    end if;
  end if;
  if validate_meal and nullif(btrim(new.meal_option), '') is not null and not exists (
    select 1 from jsonb_array_elements(package_row.meal_options) item
      where new.meal_option in (item ->> 'es', item ->> 'en')
  ) then
    if tg_op = 'UPDATE' then
      if new.tour_package_id is distinct from old.tour_package_id and new.meal_option is not distinct from old.meal_option then
        new.meal_option := null;
        return new;
      end if;
    end if;
    raise exception 'La comida seleccionada no está disponible para este paquete.' using errcode = '22023';
  end if;
  return new;
end;
$$;


-- RESOLUTION RULE (single, used by get-booking-availability, the booking validation trigger above and the public catalog):
--   departure_times IS NULL        -> time_slots WHERE active AND is_general
--   departure_times = '{}'         -> no departures
--   departure_times = {'08:00',..} -> exactly those hours (their time_slots rows must be active); general hours are NOT added.
--
-- A package that drops / replaces an hour of its own list (13:30 -> 13:45) never edits the shared row 13:30 (other packages may use it). The new
-- hour is registered / reused by prepare_package_settings; afterwards the old row is released ONLY if nothing needs it any more: it is not part of
-- the general catalog and no package lists it. Released = active false (never deleted: bookings / blocks may reference it).
create or replace function public.release_unused_package_hours()
returns trigger language plpgsql set search_path = public as $$
declare removed text[];
begin
  if tg_op = 'DELETE' then
    removed := coalesce(old.departure_times, '{}'::text[]);
  else
    removed := array(select unnest(coalesce(old.departure_times, '{}'::text[])) except select unnest(coalesce(new.departure_times, '{}'::text[])));
  end if;
  if cardinality(removed) = 0 then return null; end if;
  update public.time_slots slot set active = false
    where slot.active and not slot.is_general
      and to_char(slot.starts_at, 'HH24:MI') = any(removed)
      and not exists (select 1 from public.tour_packages p where p.departure_times @> array[to_char(slot.starts_at, 'HH24:MI')]);
  return null;
end;
$$;
drop trigger if exists tour_packages_release_unused_hours on public.tour_packages;
create trigger tour_packages_release_unused_hours
after update of departure_times or delete on public.tour_packages
for each row execute function public.release_unused_package_hours();


-- GENERAL CATALOG MANAGEMENT ---------------------------------------------------------------------------------------------------------------
-- Create (or re-activate) a general hour. Idempotent: the same hour never produces a second row.
create or replace function public.admin_create_time_slot(p_time text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot public.time_slots%rowtype;
  v_created boolean := false;
begin
  if not public.is_editor_or_admin() then
    raise exception 'admin or editor role required' using errcode = '42501';
  end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'La hora debe tener formato HH:MM de 24 horas.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('package-departure-' || p_time, 0)); -- same lock the package trigger takes
  select * into v_slot from public.time_slots where starts_at = p_time::time for update;
  if v_slot.id is null then
    insert into public.time_slots (id, label, starts_at, active, is_general)
    values ('departure-' || replace(p_time, ':', ''), p_time, p_time::time, true, true) returning * into v_slot;
    v_created := true;
  elsif not (v_slot.is_general and v_slot.active) then
    -- the hour was only registered for a package (or was removed from the catalog): it now joins the catalog
    update public.time_slots set is_general = true, active = true where id = v_slot.id returning * into v_slot;
    v_created := true;
  end if;
  return jsonb_build_object('id', v_slot.id, 'time', to_char(v_slot.starts_at, 'HH24:MI'), 'created', v_created);
end;
$$;

-- Edit a general hour (13:30 -> 13:45). ONLY the catalog changes: packages that inherit see the new hour by themselves, and packages with their
-- own list are NOT touched, even if they happen to contain the old hour. Existing bookings keep the slot (and the hour) they were made with.
create or replace function public.admin_update_time_slot(p_id text, p_time text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old public.time_slots%rowtype;
  v_old_time text;
  v_new public.time_slots%rowtype;
  v_old_still_used boolean;
begin
  if not public.is_editor_or_admin() then
    raise exception 'admin or editor role required' using errcode = '42501';
  end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'La hora debe tener formato HH:MM de 24 horas.' using errcode = '22023';
  end if;
  select * into v_old from public.time_slots where id = p_id and is_general and active for update;
  if v_old.id is null then
    raise exception 'El horario general ya no existe.' using errcode = '22023';
  end if;
  v_old_time := to_char(v_old.starts_at, 'HH24:MI');
  if v_old_time = p_time then
    return jsonb_build_object('id', v_old.id, 'time', p_time, 'changed', false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('package-departure-' || least(v_old_time, p_time), 0));
  perform pg_advisory_xact_lock(hashtextextended('package-departure-' || greatest(v_old_time, p_time), 0));
  select * into v_new from public.time_slots where starts_at = p_time::time for update;
  if v_new.id is not null and v_new.is_general and v_new.active then
    raise exception 'Ya existe un horario general a las %.', p_time using errcode = '22023';
  end if;
  if v_new.id is null then
    insert into public.time_slots (id, label, starts_at, active, is_general)
    values ('departure-' || replace(p_time, ':', ''), p_time, p_time::time, true, true) returning * into v_new;
  else
    update public.time_slots set is_general = true, active = true where id = v_new.id returning * into v_new;
  end if;
  -- The old hour leaves the catalog. It stays usable (active) only while some package lists it as ITS OWN hour.
  select exists (select 1 from public.tour_packages where departure_times @> array[v_old_time]) into v_old_still_used;
  update public.time_slots set is_general = false, active = v_old_still_used where id = v_old.id;
  return jsonb_build_object('id', v_new.id, 'time', p_time, 'changed', true, 'old_time_kept_for_packages', v_old_still_used);
end;
$$;

-- Delete a general hour: it leaves the catalog (packages that inherit stop offering it). Never a hard delete: bookings / blocks may reference
-- it, and packages that list this hour as their own keep it.
create or replace function public.admin_delete_time_slot(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slot public.time_slots%rowtype;
  v_time text;
  v_still_used boolean;
  v_general_left int;
begin
  if not public.is_editor_or_admin() then
    raise exception 'admin or editor role required' using errcode = '42501';
  end if;
  select * into v_slot from public.time_slots where id = p_id and is_general and active for update;
  if v_slot.id is null then
    raise exception 'El horario general ya no existe.' using errcode = '22023';
  end if;
  v_time := to_char(v_slot.starts_at, 'HH24:MI');
  perform pg_advisory_xact_lock(hashtextextended('package-departure-' || v_time, 0));
  select exists (select 1 from public.tour_packages where departure_times @> array[v_time]) into v_still_used;
  update public.time_slots set is_general = false, active = v_still_used where id = v_slot.id;
  select count(*) into v_general_left from public.time_slots where is_general and active;
  return jsonb_build_object('id', v_slot.id, 'time', v_time, 'kept_for_packages', v_still_used, 'general_left', v_general_left);
end;
$$;

revoke all on function public.admin_create_time_slot(text) from public, anon;
revoke all on function public.admin_update_time_slot(text, text) from public, anon;
revoke all on function public.admin_delete_time_slot(text) from public, anon;
grant execute on function public.admin_create_time_slot(text) to authenticated;
grant execute on function public.admin_update_time_slot(text, text) to authenticated;
grant execute on function public.admin_delete_time_slot(text) to authenticated;
