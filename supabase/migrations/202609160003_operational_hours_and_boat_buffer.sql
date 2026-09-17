-- Generic operational end time per tour and the confirmed two-hour boat buffer.
-- NULL keeps the operational-hours rule disabled until a business value is set.
alter table public.tours
  add column if not exists operating_end_time time;

comment on column public.tours.operating_end_time is
  'Latest local time at which this tour may finish; NULL means no configured limit.';

create or replace function public.prevent_booking_outside_tour_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration_minutes integer;
  v_start_time time;
  v_operating_end time;
  v_tour_end timestamp without time zone;
begin
  if new.booking_status = 'cancelled' then
    return new;
  end if;

  select tp.duration_minutes, ts.starts_at, t.operating_end_time
    into v_duration_minutes, v_start_time, v_operating_end
    from public.tour_packages tp
    join public.time_slots ts on ts.id = new.time_slot_id and ts.active = true
    join public.tours t on t.id = new.tour_id and t.active = true
   where tp.id = new.tour_package_id and tp.active = true;

  if v_duration_minutes is null or v_duration_minutes <= 0 or v_start_time is null then
    return new;
  end if;

  if v_operating_end is not null then
    v_tour_end := new.tour_date + v_start_time + make_interval(mins => v_duration_minutes);
    if v_tour_end > new.tour_date + v_operating_end then
      raise exception 'OUTSIDE_OPERATING_HOURS: The tour ends after the configured operating time.'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_buffered_boat_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration_minutes integer;
  v_start_time time;
  v_new_start timestamp without time zone;
  v_new_occupied_end timestamp without time zone;
begin
  if new.booking_status = 'cancelled' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.boat_id is not distinct from old.boat_id
     and new.tour_date is not distinct from old.tour_date
     and new.time_slot_id is not distinct from old.time_slot_id
     and new.tour_package_id is not distinct from old.tour_package_id
     and old.booking_status <> 'cancelled' then
    return new;
  end if;

  select tp.duration_minutes, ts.starts_at
    into v_duration_minutes, v_start_time
    from public.tour_packages tp
    join public.time_slots ts on ts.id = new.time_slot_id and ts.active = true
   where tp.id = new.tour_package_id and tp.active = true;

  if v_duration_minutes is null or v_duration_minutes <= 0 or v_start_time is null then
    return new;
  end if;

  v_new_start := new.tour_date + v_start_time;
  v_new_occupied_end := v_new_start + make_interval(mins => v_duration_minutes + 120);

  perform pg_advisory_xact_lock(hashtextextended(new.boat_id || ':' || new.tour_date::text, 0));

  if exists (
    select 1
      from public.bookings b
      join public.tour_packages tp on tp.id = b.tour_package_id
      join public.time_slots ts on ts.id = b.time_slot_id
     where b.boat_id = new.boat_id
       and b.tour_date = new.tour_date
       and b.id is distinct from new.id
       and b.booking_status in ('pending', 'pending_payment', 'pending_confirmation', 'confirmed', 'completed')
       and (b.expires_at is null or b.expires_at > now())
       and v_new_start < (b.tour_date + ts.starts_at) + make_interval(mins => tp.duration_minutes + 120)
       and (b.tour_date + ts.starts_at) < v_new_occupied_end
  ) then
    raise exception 'BOAT_TIME_CONFLICT: The selected boat is no longer available for this time.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_prevent_outside_tour_hours on public.bookings;
create trigger bookings_prevent_outside_tour_hours
before insert or update of boat_id, tour_id, tour_date, time_slot_id, tour_package_id, booking_status
on public.bookings
for each row execute function public.prevent_booking_outside_tour_hours();

drop trigger if exists bookings_prevent_buffered_boat_booking on public.bookings;
create trigger bookings_prevent_buffered_boat_booking
before insert or update of boat_id, tour_date, time_slot_id, tour_package_id, booking_status
on public.bookings
for each row execute function public.prevent_buffered_boat_booking();

revoke all on function public.prevent_booking_outside_tour_hours() from public;
revoke all on function public.prevent_buffered_boat_booking() from public;
