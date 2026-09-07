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
begin
  if not public.is_editor_or_admin() then
    raise exception 'admin or editor role required' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = (payload ->> 'bookingId')::uuid for update;
  if v_booking.id is null then raise exception 'booking not found' using errcode = '22023'; end if;
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

  update public.availability_blocks set boat_id = v_boat_tour.boat_id, tour_date = v_tour_date, time_slot_id = v_time_slot_id
    where booking_id = v_booking.id and source = 'booking' and active = true;
  if not found then
    insert into public.availability_blocks (boat_id, tour_date, time_slot_id, reason, source, booking_id, active)
    values (v_boat_tour.boat_id, v_tour_date, v_time_slot_id, 'Booking hold ' || v_booking.booking_reference, 'booking', v_booking.id, true);
  end if;

  return jsonb_build_object('booking_id', v_booking.id, 'booking_status', v_booking.booking_status, 'payment_status', v_booking.payment_status);
exception when unique_violation then
  raise exception 'selected boat, date and time slot is already reserved' using errcode = '23505';
end;
$$;

revoke all on function public.update_booking_details(jsonb) from public;
grant execute on function public.update_booking_details(jsonb) to authenticated;
