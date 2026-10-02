-- Historical bookings retain their original amounts and tax rate.
alter table public.bookings
  add column tax_rate_snapshot numeric(5,4) not null default 0,
  add column tax_amount_snapshot numeric(10,2) not null default 0,
  add column subtotal_snapshot numeric(10,2);
update public.bookings set subtotal_snapshot = total_snapshot;
alter table public.bookings alter column subtotal_snapshot set not null;
alter table public.bookings alter column tax_rate_snapshot set default 0.13;

-- Single authoritative IVA formula, using decimal arithmetic.
create or replace function public.calculate_booking_iva(p_base_amount numeric, p_tax_rate numeric default 0.13)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('base_amount', round(p_base_amount, 2), 'tax_rate', p_tax_rate,
    'tax_amount', round(round(p_base_amount, 2) * p_tax_rate, 2),
    'total_amount', round(p_base_amount, 2) + round(round(p_base_amount, 2) * p_tax_rate, 2));
$$;

create or replace function public.set_booking_iva_snapshots()
returns trigger language plpgsql set search_path = public as $$
declare price jsonb;
begin
  price := public.calculate_booking_iva(new.base_price_snapshot + new.extra_guests_total_snapshot
    + new.extras_total_snapshot + coalesce(new.departure_surcharge_snapshot, 0), new.tax_rate_snapshot);
  new.subtotal_snapshot := (price ->> 'base_amount')::numeric;
  new.tax_amount_snapshot := (price ->> 'tax_amount')::numeric;
  new.total_snapshot := (price ->> 'total_amount')::numeric;
  return new;
end;
$$;
create trigger booking_iva_snapshots before insert or update of base_price_snapshot,
  extra_guests_total_snapshot, extras_total_snapshot, departure_surcharge_snapshot, tax_rate_snapshot, total_snapshot
  on public.bookings for each row execute function public.set_booking_iva_snapshots();

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
begin
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
  elsif v_payment_method_key = 'pay-on-day' then
    v_payment_status := 'not_required_yet';
    v_booking_status := 'pending_confirmation';
    v_expires_at := null;
  else
    v_payment_status := 'pending';
    v_booking_status := 'pending_payment';
    v_expires_at := null;
  end if;

  select id into v_customer_id
    from public.customers
    where lower(email) = lower(v_customer ->> 'email')
      and regexp_replace(whatsapp, '\D', '', 'g') = regexp_replace(v_customer ->> 'whatsapp', '\D', '', 'g')
    order by created_at desc
    limit 1;

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
    extra_guests_total_snapshot, extras_total_snapshot, total_snapshot, expires_at
  ) values (
    v_booking_id, v_reference, v_customer_id, v_boat_id, v_tour_id, v_boat_tour.id, v_package.id,
    v_tour_date, v_time_slot_id, v_guests, v_departure_location.id, v_departure_location.name,
    v_departure_location.surcharge_amount, v_departure_location.currency, v_meal_option, v_special_requests,
    v_payment_method_key, v_payment_status, v_booking_status, 'USD', v_package.base_price,
    v_package.included_guests, v_package.max_guests, v_package.extra_guest_price, v_extra_guests,
    v_extra_guests_total, v_extras_total, v_total, v_expires_at
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
$$;


-- Read-only pagination and literal search across related reservation fields.
-- Invoker permissions preserve the existing RLS policies, including viewer access.
create or replace function public.list_admin_bookings(
  p_search text default '',
  p_booking_status text default 'all',
  p_payment_status text default 'all',
  p_tour_date date default null,
  p_offset integer default 0,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not in (10, 25, 50) then
    raise exception 'Invalid pagination parameters' using errcode = '22023';
  end if;
  return (
    with filtered as (
      select b.id, b.boat_id, b.tour_id, b.tour_package_id, b.time_slot_id,
        b.special_requests, b.booking_reference, b.tour_date, b.guests,
        b.base_price_snapshot, b.subtotal_snapshot, b.tax_rate_snapshot, b.tax_amount_snapshot, b.extra_guests_total_snapshot, b.extras_total_snapshot, b.total_snapshot, b.departure_location_name_snapshot, b.departure_surcharge_snapshot,
        b.payment_method_key, b.payment_status, b.booking_status, b.created_at,
        case when c.id is not null then jsonb_build_object('full_name', c.full_name, 'email', c.email, 'whatsapp', c.whatsapp) end as customers,
        case when boat.id is not null then jsonb_build_object('name', boat.name) end as boats,
        case when t.id is not null then jsonb_build_object('title', t.title) end as tours,
        case when slot.id is not null then jsonb_build_object('label', slot.label) end as time_slots
      from public.bookings b
      left join public.customers c on c.id = b.customer_id
      left join public.boats boat on boat.id = b.boat_id
      left join public.tours t on t.id = b.tour_id
      left join public.time_slots slot on slot.id = b.time_slot_id
      where (coalesce(p_booking_status, 'all') = 'all' or b.booking_status = p_booking_status)
        and (coalesce(p_payment_status, 'all') = 'all' or b.payment_status = p_payment_status)
        and (p_tour_date is null or b.tour_date = p_tour_date)
        and (coalesce(p_search, '') = '' or position(lower(p_search) in lower(
          concat_ws(' ', b.booking_reference, c.full_name, c.email, c.whatsapp, boat.name, t.title)
        )) > 0)
    ), paged as (
      select * from filtered order by tour_date asc, created_at desc, id asc
      limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by tour_date asc, created_at desc, id asc) from paged), '[]'::jsonb),
      'total', (select count(*) from filtered)
    )
  );
end;
$$;
