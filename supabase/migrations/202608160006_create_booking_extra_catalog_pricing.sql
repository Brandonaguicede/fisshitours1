create or replace function public.create_booking_transaction(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer jsonb := payload -> 'customer';
  v_boat_id text := payload ->> 'boatId';
  v_tour_id text := payload ->> 'tourId';
  v_tour_package_id text := payload ->> 'tourPackageId';
  v_tour_date date := (payload ->> 'tourDate')::date;
  v_time_slot_id text := payload ->> 'timeSlotId';
  v_guests int := (payload ->> 'guests')::int;
  v_payment_method_key text := payload ->> 'paymentMethodKey';
  v_meal_option text := nullif(payload ->> 'mealOption', '');
  v_special_requests text := nullif(payload ->> 'specialRequests', '');
  v_extras jsonb := coalesce(payload -> 'extras', '[]'::jsonb);
  v_customer_id uuid;
  v_booking_id uuid := gen_random_uuid();
  v_reference text;
  v_boat_tour public.boat_tours%rowtype;
  v_package public.tour_packages%rowtype;
  v_extra_guests int;
  v_extra_guests_total numeric(10,2);
  v_extras_total numeric(10,2) := 0;
  v_total numeric(10,2);
  v_payment_status text;
  v_booking_status text;
  v_expires_at timestamptz;
  v_hold_minutes int := coalesce(nullif(current_setting('app.paypal_hold_minutes', true), '')::int, 30);
  v_extra jsonb;
  v_extra_record public.extras%rowtype;
  v_extra_quantity int;
  v_extra_total numeric(10,2);
begin
  if v_customer is null then
    raise exception 'customer is required' using errcode = '22023';
  end if;

  if v_boat_id is null or v_tour_id is null or v_tour_package_id is null or v_time_slot_id is null then
    raise exception 'booking catalog selection is incomplete' using errcode = '22023';
  end if;

  if v_tour_date < current_date then
    raise exception 'tour date must not be in the past' using errcode = '22023';
  end if;

  if v_guests is null or v_guests <= 0 then
    raise exception 'guests must be greater than zero' using errcode = '22023';
  end if;

  if not exists (select 1 from public.boats where id = v_boat_id and active = true) then
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

  select *
    into v_boat_tour
    from public.boat_tours
    where boat_id = v_boat_id
      and tour_id = v_tour_id
      and active = true
    limit 1;

  if v_boat_tour.id is null then
    raise exception 'boat does not offer selected tour' using errcode = '22023';
  end if;

  select *
    into v_package
    from public.tour_packages
    where id = v_tour_package_id
      and boat_tour_id = v_boat_tour.id
      and active = true
    limit 1;

  if v_package.id is null then
    raise exception 'tour package is not available for selected boat and tour' using errcode = '22023';
  end if;

  if v_package.custom_quote then
    raise exception 'custom quote packages require manual admin handling' using errcode = '22023';
  end if;

  if v_guests > v_package.max_guests then
    raise exception 'guest quantity exceeds capacity' using errcode = '22023';
  end if;

  v_extra_guests := greatest(v_guests - v_package.included_guests, 0);
  v_extra_guests_total := v_extra_guests * v_package.extra_guest_price;

  for v_extra in select * from jsonb_array_elements(v_extras)
  loop
    v_extra_quantity := (v_extra ->> 'quantity')::int;
    if v_extra_quantity <= 0 then
      raise exception 'extra quantity must be greater than zero' using errcode = '22023';
    end if;

    select e.*
      into v_extra_record
      from public.extras e
      join public.package_extras pe on pe.extra_id = e.id
      where e.key = (v_extra ->> 'key')
        and e.active = true
        and pe.active = true
        and pe.tour_package_id = v_package.id
      limit 1;

    if v_extra_record.id is null then
      raise exception 'extra is not available for selected package' using errcode = '22023';
    end if;

    v_extra_total := v_extra_quantity * v_extra_record.unit_price;
    v_extras_total := v_extras_total + v_extra_total;
  end loop;

  v_total := v_package.base_price + v_extra_guests_total + v_extras_total;

  if v_payment_method_key = 'paypal' then
    v_payment_status := 'pending';
    v_booking_status := 'pending_payment';
    v_expires_at := now() + make_interval(mins => v_hold_minutes);
  elsif v_payment_method_key = 'whatsapp-link' then
    v_payment_status := 'pending';
    v_booking_status := 'pending_payment';
    v_expires_at := null;
  elsif v_payment_method_key = 'pay-on-day' then
    v_payment_status := 'not_required_yet';
    v_booking_status := 'pending_confirmation';
    v_expires_at := null;
  else
    raise exception 'payment method is not supported for public booking' using errcode = '22023';
  end if;

  select id
    into v_customer_id
    from public.customers
    where lower(email) = lower(v_customer ->> 'email')
       or regexp_replace(whatsapp, '\D', '', 'g') = regexp_replace(v_customer ->> 'whatsapp', '\D', '', 'g')
    order by created_at desc
    limit 1;

  if v_customer_id is null then
    insert into public.customers (full_name, email, whatsapp, country)
    values (
      trim(v_customer ->> 'fullName'),
      lower(trim(v_customer ->> 'email')),
      trim(v_customer ->> 'whatsapp'),
      nullif(trim(coalesce(v_customer ->> 'country', '')), '')
    )
    returning id into v_customer_id;
  else
    update public.customers
      set full_name = trim(v_customer ->> 'fullName'),
          email = lower(trim(v_customer ->> 'email')),
          whatsapp = trim(v_customer ->> 'whatsapp'),
          country = nullif(trim(coalesce(v_customer ->> 'country', '')), '')
      where id = v_customer_id;
  end if;

  loop
    v_reference := 'PFT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.bookings where booking_reference = v_reference);
  end loop;

  insert into public.bookings (
    id,
    booking_reference,
    customer_id,
    boat_id,
    tour_id,
    boat_tour_id,
    tour_package_id,
    tour_date,
    time_slot_id,
    guests,
    meal_option,
    special_requests,
    payment_method_key,
    payment_status,
    booking_status,
    currency,
    base_price_snapshot,
    included_guests_snapshot,
    max_guests_snapshot,
    extra_guest_price_snapshot,
    extra_guests_snapshot,
    extra_guests_total_snapshot,
    extras_total_snapshot,
    total_snapshot,
    expires_at
  ) values (
    v_booking_id,
    v_reference,
    v_customer_id,
    v_boat_id,
    v_tour_id,
    v_boat_tour.id,
    v_package.id,
    v_tour_date,
    v_time_slot_id,
    v_guests,
    v_meal_option,
    v_special_requests,
    v_payment_method_key,
    v_payment_status,
    v_booking_status,
    'USD',
    v_package.base_price,
    v_package.included_guests,
    v_package.max_guests,
    v_package.extra_guest_price,
    v_extra_guests,
    v_extra_guests_total,
    v_extras_total,
    v_total,
    v_expires_at
  );

  for v_extra in select * from jsonb_array_elements(v_extras)
  loop
    v_extra_quantity := (v_extra ->> 'quantity')::int;
    select e.*
      into v_extra_record
      from public.extras e
      join public.package_extras pe on pe.extra_id = e.id
      where e.key = (v_extra ->> 'key')
        and e.active = true
        and pe.active = true
        and pe.tour_package_id = v_package.id
      limit 1;

    insert into public.booking_extras (booking_id, key, label, quantity, unit_price, total)
    values (
      v_booking_id,
      v_extra_record.key,
      v_extra_record.label,
      v_extra_quantity,
      v_extra_record.unit_price,
      v_extra_quantity * v_extra_record.unit_price
    );
  end loop;

  insert into public.booking_status_history (
    booking_id,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    note
  ) values (
    v_booking_id,
    null,
    v_booking_status,
    null,
    v_payment_status,
    'Booking created by create-booking Edge Function'
  );

  insert into public.availability_blocks (
    boat_id,
    tour_date,
    time_slot_id,
    reason,
    source,
    booking_id,
    active
  ) values (
    v_boat_id,
    v_tour_date,
    v_time_slot_id,
    'Booking hold ' || v_reference,
    'booking',
    v_booking_id,
    true
  );

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
    'currency', 'USD',
    'base_price_snapshot', v_package.base_price,
    'extra_guests_snapshot', v_extra_guests,
    'extra_guests_total_snapshot', v_extra_guests_total,
    'extras_total_snapshot', v_extras_total,
    'total_snapshot', v_total,
    'payment_status', v_payment_status,
    'booking_status', v_booking_status,
    'expires_at', v_expires_at
  );
exception
  when unique_violation then
    raise exception 'selected boat, date and time slot is already reserved' using errcode = '23505';
end;
$$;

revoke all on function public.create_booking_transaction(jsonb) from public;
grant execute on function public.create_booking_transaction(jsonb) to service_role;
