-- Reservation edits: (1) no more self-conflict when a booking is moved, (2) an audit trail with a mandatory reason for operational
-- changes (booking_changes), (3) every booking that becomes `confirmed` — from any flow — starts with google_calendar_sync_status = 'pending'.
--
-- (1) ROOT CAUSE of "selected boat, date and time slot is already reserved" on edit: moving a CONFIRMED booking updates bookings.time_slot_id /
--     tour_date, which fires sync_booking_availability_block(); that function INSERTED a new block for the new slot while the booking's old block
--     was still active, and update_booking_details() then moved BOTH blocks to the same slot -> unique_violation, reported as "already reserved".
--     The overlap / buffer guards were already fine (they exclude the booking itself and ignore cancelled bookings). Now the trigger MOVES the
--     booking's own block and only inserts when the booking has none. Cancelled bookings keep freeing their block (active = false).

create or replace function public.sync_booking_availability_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_status = 'confirmed' then
    -- The booking already holds its slot: move that hold (never create a second one). If the new slot belongs to ANOTHER booking or a manual
    -- block, the unique index rejects the move (and the BEFORE guards raise BOAT_TIME_CONFLICT first).
    update public.availability_blocks
      set boat_id = new.boat_id,
          tour_date = new.tour_date,
          time_slot_id = new.time_slot_id,
          reason = 'Confirmed booking ' || new.booking_reference
      where booking_id = new.id and source = 'booking' and active = true;
    if not found then
      insert into public.availability_blocks (boat_id, tour_date, time_slot_id, reason, source, booking_id, active)
      values (new.boat_id, new.tour_date, new.time_slot_id, 'Confirmed booking ' || new.booking_reference, 'booking', new.id, true)
      on conflict (boat_id, tour_date, time_slot_id)
        where active = true
      do update
        set reason = excluded.reason,
            source = 'booking',
            booking_id = new.id
        where public.availability_blocks.booking_id = new.id
           or public.availability_blocks.booking_id is null;
    end if;
  elsif new.booking_status = 'cancelled' then
    -- Cancelling frees the slot at once; the booking itself is kept for history.
    update public.availability_blocks
      set active = false
      where booking_id = new.id
        and source = 'booking';
  end if;

  return new;
end;
$$;

-- (2) Audit trail of operational edits. Only rows written by update_booking_details() (security definer); admins / editors can read them.
create table if not exists public.booking_changes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  reason text not null check (length(btrim(reason)) >= 3),
  changed_at timestamptz not null default now(),
  -- { "tour_date": { "before": "2026-09-27", "after": "2026-09-28" }, "departure_time": { ... } } — only the fields that really changed.
  changes jsonb not null check (jsonb_typeof(changes) = 'object' and changes <> '{}'::jsonb)
);

create index if not exists booking_changes_booking_idx on public.booking_changes (booking_id, changed_at desc);

alter table public.booking_changes enable row level security;

drop policy if exists "editors read booking changes" on public.booking_changes;
create policy "editors read booking changes"
  on public.booking_changes for select to authenticated
  using (public.is_editor_or_admin());

revoke all on table public.booking_changes from public, anon;
grant select on table public.booking_changes to authenticated;
grant all on table public.booking_changes to service_role;

create or replace function public.update_booking_details(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_customer jsonb := payload -> 'customer';
  v_package_id text := payload ->> 'tourPackageId';
  v_tour_date date := (payload ->> 'tourDate')::date;
  v_time_slot_id text := payload ->> 'timeSlotId';
  v_guests integer := (payload ->> 'guests')::integer;
  v_reason text := nullif(btrim(coalesce(payload ->> 'reason', '')), '');
  v_boat_tour public.boat_tours%rowtype;
  v_package public.tour_packages%rowtype;
  v_departure public.departure_locations%rowtype;
  v_boat_max integer;
  v_capacity integer;
  v_extra_guests integer;
  v_extra_total numeric(10,2);
  v_total numeric(10,2);
  v_booking_extra record;
  v_extra record;
  v_changes jsonb := '{}'::jsonb;
  v_old_time text;
  v_new_time text;
begin
  if not public.is_editor_or_admin() then
    raise exception 'admin or editor role required' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = (payload ->> 'bookingId')::uuid for update;
  if v_booking.id is null then raise exception 'booking not found' using errcode = '22023'; end if;
  -- A cancelled / completed booking is history, not an active reservation: it is not edited like one.
  if v_booking.booking_status in ('cancelled', 'completed') then raise exception 'booking cannot be edited in its current status' using errcode = '22023'; end if;

  select * into v_departure from public.departure_locations where id = v_booking.departure_location_id and active = true;
  select * into v_package from public.tour_packages where id = v_package_id and active = true;
  if v_package.id is null then raise exception 'tour package is not available for selected boat and tour' using errcode = '22023'; end if;
  -- The package is authoritative. Ignore client-supplied boatId/tourId and
  -- derive both relationships from the active package and its boat_tour.
  select * into v_boat_tour from public.boat_tours where id = v_package.boat_tour_id and active = true;
  if v_boat_tour.id is null then raise exception 'tour package relationship is inactive' using errcode = '22023'; end if;
  select max_guests into v_boat_max from public.boats where id = v_boat_tour.boat_id and active = true;
  if v_boat_max is null then raise exception 'boat is not available' using errcode = '22023'; end if;
  if not exists (select 1 from public.tours where id = v_boat_tour.tour_id and active = true) then raise exception 'tour is not available' using errcode = '22023'; end if;
  if not exists (select 1 from public.time_slots where id = v_time_slot_id and active = true) then raise exception 'time slot is not available' using errcode = '22023'; end if;
  v_capacity := least(v_package.max_guests, v_boat_max);
  if v_guests is null or v_guests <= 0 or v_guests > v_capacity then raise exception 'guest quantity exceeds capacity' using errcode = '22023'; end if;
  if v_tour_date < current_date then raise exception 'tour date must not be in the past' using errcode = '22023'; end if;

  -- Operational changes (they change what happens on the water): date, time, package (and with it boat / tour) and guests.
  -- Contact details and notes are not operational: no reason needed, nothing audited.
  select to_char(starts_at, 'HH24:MI') into v_old_time from public.time_slots where id = v_booking.time_slot_id;
  select to_char(starts_at, 'HH24:MI') into v_new_time from public.time_slots where id = v_time_slot_id;
  if v_booking.tour_date is distinct from v_tour_date then
    v_changes := v_changes || jsonb_build_object('tour_date', jsonb_build_object('before', v_booking.tour_date, 'after', v_tour_date));
  end if;
  if v_booking.time_slot_id is distinct from v_time_slot_id then
    v_changes := v_changes || jsonb_build_object('departure_time', jsonb_build_object('before', v_old_time, 'after', v_new_time));
  end if;
  if v_booking.tour_package_id is distinct from v_package.id then
    v_changes := v_changes || jsonb_build_object('tour_package', jsonb_build_object(
      'before', (select name from public.tour_packages where id = v_booking.tour_package_id), 'after', v_package.name));
  end if;
  if v_booking.boat_id is distinct from v_boat_tour.boat_id then
    v_changes := v_changes || jsonb_build_object('boat', jsonb_build_object(
      'before', (select name from public.boats where id = v_booking.boat_id), 'after', (select name from public.boats where id = v_boat_tour.boat_id)));
  end if;
  if v_booking.tour_id is distinct from v_boat_tour.tour_id then
    v_changes := v_changes || jsonb_build_object('tour', jsonb_build_object(
      'before', (select title from public.tours where id = v_booking.tour_id), 'after', (select title from public.tours where id = v_boat_tour.tour_id)));
  end if;
  if v_booking.guests is distinct from v_guests then
    v_changes := v_changes || jsonb_build_object('guests', jsonb_build_object('before', v_booking.guests, 'after', v_guests));
  end if;
  if v_changes <> '{}'::jsonb and (v_reason is null or length(v_reason) < 3) then
    raise exception 'Indica el motivo de la modificación.' using errcode = '22023';
  end if;

  v_extra_guests := greatest(v_guests - v_package.included_guests, 0);
  v_extra_total := v_extra_guests * v_package.extra_guest_price;
  for v_booking_extra in select * from public.booking_extras where booking_id = v_booking.id loop
    select e.key, e.label, e.unit_price into v_extra
      from public.extras e join public.package_extras pe on pe.extra_id = e.id
     where e.key = v_booking_extra.key and e.active = true and pe.tour_package_id = v_package.id and pe.active = true;
    if v_extra.key is null then raise exception 'existing extra is not available in selected package' using errcode = '22023'; end if;
    update public.booking_extras set label = v_extra.label, unit_price = v_extra.unit_price, total = v_booking_extra.quantity * v_extra.unit_price where id = v_booking_extra.id;
  end loop;
  select coalesce(sum(total), 0) into v_total from public.booking_extras where booking_id = v_booking.id;
  v_total := v_package.base_price + v_extra_total + v_total + coalesce(v_departure.surcharge_amount, 0);

  update public.customers set
    full_name = trim(v_customer ->> 'fullName'),
    email = nullif(lower(trim(coalesce(v_customer ->> 'email', ''))), ''),
    whatsapp = trim(v_customer ->> 'whatsapp'),
    country = nullif(trim(coalesce(v_customer ->> 'country', '')), '')
  where id = v_booking.customer_id;

  update public.bookings set
    boat_id = v_boat_tour.boat_id, tour_id = v_boat_tour.tour_id, boat_tour_id = v_boat_tour.id, tour_package_id = v_package.id,
    tour_date = v_tour_date, time_slot_id = v_time_slot_id, guests = v_guests,
    special_requests = nullif(trim(coalesce(payload ->> 'specialRequests', '')), ''),
    base_price_snapshot = v_package.base_price, included_guests_snapshot = v_package.included_guests,
    max_guests_snapshot = v_package.max_guests, extra_guest_price_snapshot = v_package.extra_guest_price,
    extra_guests_snapshot = v_extra_guests, extra_guests_total_snapshot = v_extra_total,
    extras_total_snapshot = v_total - v_package.base_price - v_extra_total - coalesce(v_departure.surcharge_amount, 0),
    total_snapshot = v_total
  where id = v_booking.id;

  -- For a confirmed booking the trigger above already moved its block; for the others this keeps / creates the hold as before.
  update public.availability_blocks set boat_id = v_boat_tour.boat_id, tour_date = v_tour_date, time_slot_id = v_time_slot_id
    where booking_id = v_booking.id and source = 'booking' and active = true;
  if not found then
    insert into public.availability_blocks (boat_id, tour_date, time_slot_id, reason, source, booking_id, active)
    values (v_boat_tour.boat_id, v_tour_date, v_time_slot_id, 'Booking hold ' || v_booking.booking_reference, 'booking', v_booking.id, true);
  end if;

  if v_changes <> '{}'::jsonb then
    insert into public.booking_changes (booking_id, changed_by, reason, changes)
    values (v_booking.id, auth.uid(), v_reason, v_changes);
  end if;

  return jsonb_build_object('booking_id', v_booking.id, 'booking_status', v_booking.booking_status, 'payment_status', v_booking.payment_status, 'changed', v_changes <> '{}'::jsonb);
exception when unique_violation then
  raise exception 'selected boat, date and time slot is already reserved' using errcode = '23505';
end;
$$;

revoke all on function public.update_booking_details(jsonb) from public;
grant execute on function public.update_booking_details(jsonb) to authenticated;

-- (3) Whatever flow confirms a booking (Admin, PayPal capture, PayPal webhook...), its calendar state starts as 'pending' and is settled
-- (synced / failed) afterwards. A booking that is confirmed AGAIN (e.g. after a cancellation) is pending again for the same reason.
create or replace function public.mark_calendar_pending_on_confirm()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.booking_status = 'confirmed' and old.booking_status is distinct from 'confirmed' then
    new.google_calendar_sync_status := 'pending';
    new.google_calendar_sync_error := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_calendar_pending_on_confirm on public.bookings;
create trigger bookings_calendar_pending_on_confirm
before update of booking_status on public.bookings
for each row execute function public.mark_calendar_pending_on_confirm();
