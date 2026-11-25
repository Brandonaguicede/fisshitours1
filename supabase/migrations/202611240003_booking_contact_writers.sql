-- Contact snapshots on bookings (step 2 of 2): the writers. Apply ONLY after migration 202611240002 AND after the Edge Functions that
-- read the snapshots are deployed (otherwise an old reader would still read the customer row, which this migration stops updating).
--
-- Replaces, in ONE pass (no intermediate version of the booking function):
--   * public.phone_match_key            one comparable value for a phone in any stored format (see below)
--   * create_booking_transaction        finds / creates the customer but NEVER updates it; stores the contact used for the reservation
--                                       in bookings.customer_*_snapshot; uses phone_match_key as a last-resort lookup
--   * update_booking_details            editing a reservation edits only ITS snapshots, never the customer
-- and drops prevent_service_customer_overwrite (202609070001), which never protected a real flow: it only acts when current_user is
-- service_role, but every writer is SECURITY DEFINER (current_user is the function owner there) and no code updates customers directly.
-- With this migration nothing updates customers anymore, so the trigger would only give a false sense of security.
--
-- phone_match_key() rules (mirrored by phoneMatchKey in src/utils/phoneNumber.ts; a test keeps both in step):
--   * the digits of the phone;
--   * a number written with "+" or "00" is international: its digits without the "00";
--   * a number with NO prefix and exactly 8 digits is a legacy Costa Rican local number (the old form accepted it): "506" + digits.
--     The checkout never stores such a value anymore, it always sends "+<country code><number>";
--   * anything else: its digits. No digits -> null (an empty phone never matches anything).
-- Everything else in the two functions is copied unchanged from 202610090001_retire_pay_on_day.sql and 202609260002_booking_edit_audit.sql.

create or replace function public.phone_match_key(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(case
    when nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') is null then null
    when btrim(p) like '+%' then regexp_replace(p, '\D', '', 'g')
    when regexp_replace(p, '\D', '', 'g') like '00%' then substr(regexp_replace(p, '\D', '', 'g'), 3)
    when char_length(regexp_replace(p, '\D', '', 'g')) = 8 then '506' || regexp_replace(p, '\D', '', 'g')
    else regexp_replace(p, '\D', '', 'g')
  end, '');
$$;

revoke all on function public.phone_match_key(text) from public, anon, authenticated;
grant execute on function public.phone_match_key(text) to service_role;

create or replace function public.create_booking_transaction(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer jsonb := payload -> 'customer';
  v_boat_id text := payload ->> 'boatId';
  v_tour_id text := payload ->> 'tourId';
  v_tour_package_id text := payload ->> 'tourPackageId';
  v_tour_date date := (payload ->> 'tourDate')::date;
  v_time_slot_id text := payload ->> 'timeSlotId';
  v_guests int := (payload ->> 'guests')::int;
  v_departure_location_id uuid := nullif(payload ->> 'departureLocationId', '')::uuid;
  v_payment_method_key text := payload ->> 'paymentMethodKey';
  v_meal_option text := nullif(payload ->> 'mealOption', '');
  v_special_requests text := nullif(payload ->> 'specialRequests', '');
  v_extras jsonb := coalesce(payload -> 'extras', '[]'::jsonb);
  v_customer_id uuid;
  v_booking_id uuid := gen_random_uuid();
  v_reference text;
  v_boat_tour public.boat_tours%rowtype;
  v_package public.tour_packages%rowtype;
  v_departure_location public.departure_locations%rowtype;
  v_boat_max_guests int;
  v_capacity_ceiling int;
  v_extra_guests int;
  v_extra_guests_total numeric(10,2);
  v_extras_total numeric(10,2) := 0;
  v_total numeric(10,2);
  v_payment_status text;
  v_booking_status text;
  v_expires_at timestamptz;
  v_hold_minutes int := coalesce(nullif(current_setting('app.paypal_hold_minutes', true), '')::int, 30);
  v_extra jsonb;
  v_extra_total numeric(10,2);
  v_extra_record record;
  v_terms_accepted boolean := coalesce((payload ->> 'termsAccepted') = 'true', false);
  v_terms_version text := nullif(payload ->> 'termsVersion', '');
  v_terms_via text := nullif(payload ->> 'termsAcceptedVia', '');
  v_language text := coalesce(nullif(payload ->> 'language', ''), 'es');
begin
  -- Terms acceptance is validated here, in the database, not only in React / the Edge Function. The server stamps the time (now()):
  -- a client-supplied timestamp is never read.
  if not v_terms_accepted then
    raise exception 'TERMS_NOT_ACCEPTED' using errcode = '22023';
  end if;
  if v_terms_version is null or v_terms_version not in ('v1') then
    raise exception 'TERMS_VERSION_UNKNOWN' using errcode = '22023';
  end if;
  if v_terms_via is null or v_terms_via not in ('web', 'admin') then
    raise exception 'TERMS_ACCEPTED_VIA_INVALID' using errcode = '22023';
  end if;
  if v_language not in ('en', 'es') then
    raise exception 'BOOKING_LANGUAGE_INVALID' using errcode = '22023';
  end if;

  if v_customer is null then
    raise exception 'customer is required' using errcode = '22023';
  end if;

  if v_boat_id is null or v_tour_id is null or v_tour_package_id is null or v_time_slot_id is null then
    raise exception 'booking catalog selection is incomplete' using errcode = '22023';
  end if;

  if v_departure_location_id is null then
    raise exception 'departure location is required' using errcode = '22023';
  end if;

  select * into v_departure_location
    from public.departure_locations
    where id = v_departure_location_id and active = true
    limit 1;

  if v_departure_location.id is null then
    raise exception 'departure location is not available' using errcode = '22023';
  end if;

  if v_tour_date < current_date then
    raise exception 'tour date must not be in the past' using errcode = '22023';
  end if;

  if v_guests is null or v_guests <= 0 then
    raise exception 'guests must be greater than zero' using errcode = '22023';
  end if;

  select max_guests into v_boat_max_guests
    from public.boats
    where id = v_boat_id and active = true;

  if v_boat_max_guests is null then
    raise exception 'boat is not available' using errcode = '22023';
  end if;

  if not exists (select 1 from public.tours where id = v_tour_id and active = true) then
    raise exception 'tour is not available' using errcode = '22023';
  end if;

  if not exists (select 1 from public.time_slots where id = v_time_slot_id and active = true) then
    raise exception 'time slot is not available' using errcode = '22023';
  end if;

  if not exists (select 1 from public.payment_methods where key = v_payment_method_key and active = true) then
    raise exception 'payment method is not available' using errcode = '22023';
  end if;

  select * into v_boat_tour
    from public.boat_tours
    where boat_id = v_boat_id and tour_id = v_tour_id and active = true
    limit 1;

  if v_boat_tour.id is null then
    raise exception 'boat does not offer selected tour' using errcode = '22023';
  end if;

  select * into v_package
    from public.tour_packages
    where id = v_tour_package_id and boat_tour_id = v_boat_tour.id and active = true
    limit 1;

  if v_package.id is null then
    raise exception 'tour package is not available for selected boat and tour' using errcode = '22023';
  end if;

  if v_package.custom_quote then
    raise exception 'custom quote packages require manual admin handling' using errcode = '22023';
  end if;

  -- Physical boat capacity is an absolute ceiling; the package cap can only lower it.
  v_capacity_ceiling := least(v_package.max_guests, v_boat_max_guests);
  if v_guests > v_capacity_ceiling then
    raise exception 'guest quantity exceeds capacity' using errcode = '22023';
  end if;

  v_extra_guests := greatest(v_guests - v_package.included_guests, 0);
  v_extra_guests_total := v_extra_guests * v_package.extra_guest_price;

  for v_extra in select * from jsonb_array_elements(v_extras)
  loop
    select e.key, e.label, e.unit_price
      into v_extra_record
      from public.extras e
      join public.package_extras pe on pe.extra_id = e.id
      where e.key = v_extra ->> 'key'
        and e.active = true
        and pe.tour_package_id = v_package.id
        and pe.active = true
      limit 1;
    if v_extra_record.key is null then
      raise exception 'invalid extra: %', v_extra ->> 'key' using errcode = '22023';
    end if;
    v_extra_total := ((v_extra ->> 'quantity')::int * v_extra_record.unit_price);
    if v_extra_total < 0 then
      raise exception 'extra total cannot be negative' using errcode = '22023';
    end if;
    v_extras_total := v_extras_total + v_extra_total;
  end loop;

  v_total := v_package.base_price + v_extra_guests_total + v_extras_total + v_departure_location.surcharge_amount;

  if v_payment_method_key = 'paypal' then
    v_payment_status := 'pending';
    v_booking_status := 'pending_payment';
    v_expires_at := now() + make_interval(mins => v_hold_minutes);
  elsif v_payment_method_key = 'whatsapp-link' then
    v_payment_status := 'pending';
    v_booking_status := 'pending_payment';
    v_expires_at := null;
  else
    v_payment_status := 'pending';
    v_booking_status := 'pending_payment';
    v_expires_at := null;
  end if;

  -- The customer is only an IDENTITY: it is found (or created once) and never modified by a booking. What the person typed for this
  -- reservation is stored in the booking itself (customer_*_snapshot below).
  select id into v_customer_id
    from public.customers
    where lower(email) = lower(v_customer ->> 'email')
       or regexp_replace(whatsapp, '\D', '', 'g') = regexp_replace(v_customer ->> 'whatsapp', '\D', '', 'g')
    order by created_at desc
    limit 1;

  -- Last resort, only when nothing above matched: the same phone written in a legacy format (stored "85331728" vs the new "+50685331728").
  if v_customer_id is null and public.phone_match_key(v_customer ->> 'whatsapp') is not null then
    select id into v_customer_id
      from public.customers
      where public.phone_match_key(whatsapp) = public.phone_match_key(v_customer ->> 'whatsapp')
      order by created_at desc
      limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (full_name, email, whatsapp, country)
    values (trim(v_customer ->> 'fullName'), lower(trim(v_customer ->> 'email')), trim(v_customer ->> 'whatsapp'), nullif(trim(coalesce(v_customer ->> 'country', '')), ''))
    returning id into v_customer_id;
  end if;

  loop
    v_reference := 'PFT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.bookings where booking_reference = v_reference);
  end loop;

  insert into public.bookings (
    id, booking_reference, customer_id, boat_id, tour_id, boat_tour_id, tour_package_id,
    tour_date, time_slot_id, guests, departure_location_id, departure_location_name_snapshot,
    departure_surcharge_snapshot, departure_currency_snapshot, meal_option, special_requests,
    payment_method_key, payment_status, booking_status, currency, base_price_snapshot,
    included_guests_snapshot, max_guests_snapshot, extra_guest_price_snapshot, extra_guests_snapshot,
    extra_guests_total_snapshot, extras_total_snapshot, total_snapshot, expires_at,
    terms_accepted, terms_accepted_at, terms_version, terms_accepted_via, language,
    customer_name_snapshot, customer_email_snapshot, customer_whatsapp_snapshot
  ) values (
    v_booking_id, v_reference, v_customer_id, v_boat_id, v_tour_id, v_boat_tour.id, v_package.id,
    v_tour_date, v_time_slot_id, v_guests, v_departure_location.id, v_departure_location.name,
    v_departure_location.surcharge_amount, v_departure_location.currency, v_meal_option, v_special_requests,
    v_payment_method_key, v_payment_status, v_booking_status, 'USD', v_package.base_price,
    v_package.included_guests, v_package.max_guests, v_package.extra_guest_price, v_extra_guests,
    v_extra_guests_total, v_extras_total, v_total, v_expires_at,
    true, now(), v_terms_version, v_terms_via, v_language,
    trim(v_customer ->> 'fullName'), nullif(lower(trim(coalesce(v_customer ->> 'email', ''))), ''), trim(v_customer ->> 'whatsapp')
  );

  for v_extra in select * from jsonb_array_elements(v_extras)
  loop
    select e.key, e.label, e.unit_price
      into v_extra_record
      from public.extras e
      join public.package_extras pe on pe.extra_id = e.id
      where e.key = v_extra ->> 'key'
        and e.active = true
        and pe.tour_package_id = v_package.id
        and pe.active = true
      limit 1;
    insert into public.booking_extras (booking_id, key, label, quantity, unit_price, total)
    values (v_booking_id, v_extra_record.key, v_extra_record.label, (v_extra ->> 'quantity')::int, v_extra_record.unit_price, ((v_extra ->> 'quantity')::int * v_extra_record.unit_price));
  end loop;

  insert into public.booking_status_history (booking_id, previous_booking_status, new_booking_status, previous_payment_status, new_payment_status, note)
  values (v_booking_id, null, v_booking_status, null, v_payment_status, 'Booking created by create-booking Edge Function');

  insert into public.availability_blocks (boat_id, tour_date, time_slot_id, reason, source, booking_id, active)
  values (v_boat_id, v_tour_date, v_time_slot_id, 'Booking hold ' || v_reference, 'booking', v_booking_id, true);

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_reference', v_reference,
    'customer_id', v_customer_id,
    'boat_id', v_boat_id,
    'tour_id', v_tour_id,
    'boat_tour_id', v_boat_tour.id,
    'tour_package_id', v_package.id,
    'tour_date', v_tour_date,
    'time_slot_id', v_time_slot_id,
    'guests', v_guests,
    'departure_location_id', v_departure_location.id,
    'departure_location_name_snapshot', v_departure_location.name,
    'departure_surcharge_snapshot', v_departure_location.surcharge_amount,
    'departure_currency_snapshot', v_departure_location.currency,
    'currency', 'USD',
    'base_price_snapshot', v_package.base_price,
    'extra_guests_snapshot', v_extra_guests,
    'extra_guests_total_snapshot', v_extra_guests_total,
    'extras_total_snapshot', v_extras_total,
    'subtotal_snapshot', (select subtotal_snapshot from public.bookings where id = v_booking_id),
    'tax_rate_snapshot', (select tax_rate_snapshot from public.bookings where id = v_booking_id),
    'tax_amount_snapshot', (select tax_amount_snapshot from public.bookings where id = v_booking_id),
    'total_snapshot', (select total_snapshot from public.bookings where id = v_booking_id),
    'payment_status', v_payment_status,
    'booking_status', v_booking_status,
    'expires_at', v_expires_at
  );
exception
  when unique_violation then
    raise exception 'selected boat, date and time slot is already reserved' using errcode = '23505';
end;
$function$
;
;

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

  -- Editing a reservation edits the contact of THAT reservation only. The customer (identity) and the other reservations of the same
  -- person are not touched. (The customer's country is not part of the reservation contact and is no longer edited from here.)
  update public.bookings set
    customer_name_snapshot = trim(v_customer ->> 'fullName'),
    customer_email_snapshot = nullif(lower(trim(coalesce(v_customer ->> 'email', ''))), ''),
    customer_whatsapp_snapshot = trim(v_customer ->> 'whatsapp'),
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

drop trigger if exists prevent_service_customer_overwrite on public.customers;
drop function if exists public.prevent_service_customer_overwrite();
