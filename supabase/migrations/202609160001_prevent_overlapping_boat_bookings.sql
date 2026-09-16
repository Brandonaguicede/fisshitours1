-- Reserve the physical boat for the configured package duration. A transaction
-- lock per boat/date closes the check-then-insert race across public and admin
-- booking paths, which both write bookings in create_booking_transaction().
create or replace function public.prevent_overlapping_boat_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration_minutes integer;
  v_start_time time;
  v_new_start timestamp without time zone;
  v_new_end timestamp without time zone;
begin
  if new.booking_status = 'cancelled' then
    return new;
  end if;

  -- A pending booking already owns its interval from creation. Normal status
  -- transitions (including PayPal confirmation) keep that same hold and do
  -- not claim it a second time. Reactivating a cancelled row still rechecks.
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
    raise exception 'Selected package duration or departure time is unavailable'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tour_packages tp
    where tp.id = new.tour_package_id
      and (tp.departure_times is null or to_char(v_start_time, 'HH24:MI') = any(tp.departure_times))
  ) then
    raise exception 'Selected departure time is not allowed for this package'
      using errcode = '22023';
  end if;

  -- DATE + TIME creates a local timestamp without a timezone conversion.
  v_new_start := new.tour_date + v_start_time;
  v_new_end := v_new_start + make_interval(mins => v_duration_minutes);

  perform pg_advisory_xact_lock(hashtextextended(new.boat_id || ':' || new.tour_date::text, 0));

  if exists (
    select 1
      from public.availability_blocks ab
     where ab.boat_id = new.boat_id
       and ab.tour_date = new.tour_date
       and ab.time_slot_id = new.time_slot_id
       and ab.active = true
       and ab.booking_id is null
  ) then
    raise exception 'BOAT_TIME_CONFLICT: The selected boat is no longer available for this time.'
      using errcode = 'P0001';
  end if;

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
       and (new.tour_date + v_start_time) < (b.tour_date + ts.starts_at) + make_interval(mins => tp.duration_minutes)
       and (b.tour_date + ts.starts_at) < v_new_end
  ) then
    raise exception 'BOAT_TIME_CONFLICT: The selected boat is no longer available for this time.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_prevent_overlapping_boat_booking on public.bookings;
create trigger bookings_prevent_overlapping_boat_booking
before insert or update of boat_id, tour_date, time_slot_id, tour_package_id, booking_status
on public.bookings
for each row execute function public.prevent_overlapping_boat_booking();

revoke all on function public.prevent_overlapping_boat_booking() from public;
