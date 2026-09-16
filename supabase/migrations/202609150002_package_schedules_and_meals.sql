-- Package-specific departure times, inclusions and bilingual meal choices.
alter table public.tour_packages
  add column departure_times text[],
  add column meal_options jsonb not null default '[]'::jsonb,
  add column package_included text[];

-- Freeze existing schedules so adding an hour to one package cannot expand others.
update public.tour_packages set departure_times = coalesce(
  (select array_agg(distinct to_char(starts_at, 'HH24:MI')) from public.time_slots where active),
  '{}'::text[]
);
update public.tour_packages set meal_options = '[
  {"en":"Chicken wrap","es":"Wrap de pollo"},
  {"en":"Ham and cheese wrap","es":"Wrap de jamon y queso"},
  {"en":"Chicken sandwich","es":"Sandwich de pollo"},
  {"en":"Ham and cheese sandwich","es":"Sandwich de jamon y queso"},
  {"en":"Caprese sandwich","es":"Sandwich caprese"},
  {"en":"Chicken salad","es":"Ensalada de pollo"},
  {"en":"Ceviche","es":"Ceviche"}
]'::jsonb
where package_type in ('full_day', 'full-day') or name ~* 'full[ -]day|día completo|dia completo';

-- An upsert saves the package and any new shared departure hours in one transaction.
-- Reuse existing slot IDs at the same time, preserving boat availability blocks.
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
      insert into public.time_slots(id, label, starts_at, active, sort_order)
      values ('departure-' || replace(departure, ':', ''), departure, departure::time, true,
        extract(hour from departure::time)::int * 60 + extract(minute from departure::time)::int);
    else
      update public.time_slots set active = true where id = resolved_id and not active;
    end if;
  end loop;
  new.departure_times := normalized_times;
  return new;
end;
$$;
create trigger tour_packages_prepare_settings
before insert or update of departure_times, meal_options, package_included on public.tour_packages
for each row execute function public.prepare_package_settings();

-- Enforce these rules for public bookings, manual bookings and rescheduling alike.
-- Existing reservations retain their original meal and hour on unrelated updates.
create or replace function public.validate_booking_package_settings()
returns trigger language plpgsql set search_path = public as $$
declare
  package_row public.tour_packages%rowtype;
  slot_time text;
  slot_active boolean;
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
    select to_char(starts_at, 'HH24:MI'), active into slot_time, slot_active from public.time_slots where id = new.time_slot_id;
    if slot_time is null or not slot_active or (package_row.departure_times is not null and not (slot_time = any(package_row.departure_times))) then
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
create trigger bookings_validate_package_settings
before insert or update on public.bookings
for each row execute function public.validate_booking_package_settings();

comment on column public.tour_packages.departure_times is 'Departure hours HH:MM per package; NULL inherits active global hours, empty array has no bookable departures.';
comment on column public.tour_packages.meal_options is 'Editable bilingual meal choices included in this package. Empty array disables meal selection.';
comment on column public.tour_packages.package_included is 'Package-specific inclusion list; NULL inherits tour inclusions, empty array explicitly has none.';
notify pgrst, 'reload schema';
