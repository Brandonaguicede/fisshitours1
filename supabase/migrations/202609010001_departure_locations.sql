create table if not exists public.departure_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  surcharge_amount numeric(10,2) not null default 0 check (surcharge_amount >= 0),
  currency text not null default 'USD',
  active boolean not null default true,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger departure_locations_set_updated_at
  before update on public.departure_locations
  for each row execute function public.set_updated_at();

alter table public.bookings
  add column if not exists departure_location_id uuid null references public.departure_locations(id) on delete restrict,
  add column if not exists departure_location_name_snapshot text null,
  add column if not exists departure_surcharge_snapshot numeric(10,2) null check (departure_surcharge_snapshot is null or departure_surcharge_snapshot >= 0),
  add column if not exists departure_currency_snapshot text null;

alter table public.departure_locations enable row level security;

create or replace function public.ensure_single_default_departure_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.departure_locations
      set is_default = false
      where id <> new.id
        and is_default = true;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_single_default_departure_location on public.departure_locations;
create trigger ensure_single_default_departure_location
  before insert or update of is_default on public.departure_locations
  for each row execute function public.ensure_single_default_departure_location();

drop policy if exists "public read active departure locations" on public.departure_locations;
create policy "public read active departure locations"
  on public.departure_locations
  for select
  to anon, authenticated
  using (active = true);

drop policy if exists "staff read all departure locations" on public.departure_locations;
create policy "staff read all departure locations"
  on public.departure_locations
  for select
  to authenticated
  using (public.is_admin_editor_viewer());

drop policy if exists "editor manage departure locations" on public.departure_locations;
create policy "editor manage departure locations"
  on public.departure_locations
  for all
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

grant select on public.departure_locations to anon, authenticated;
grant insert, update, delete on public.departure_locations to authenticated;

insert into public.departure_locations (name, slug, description, surcharge_amount, currency, active, sort_order, is_default)
values
  ('Playas del Coco', 'playas-del-coco', 'Salida local principal.', 0, 'USD', true, 10, true),
  ('Tamarindo', 'tamarindo', null, 50, 'USD', true, 20, false),
  ('Las Catalinas', 'las-catalinas', null, 50, 'USD', true, 30, false),
  ('Playa Conchal', 'playa-conchal', null, 50, 'USD', true, 40, false),
  ('Flamingo', 'flamingo', null, 50, 'USD', true, 50, false)
on conflict (slug) do update
  set name = excluded.name,
      surcharge_amount = excluded.surcharge_amount,
      currency = excluded.currency,
      active = true,
      sort_order = excluded.sort_order,
      is_default = excluded.is_default;

create or replace function public.prevent_departure_location_delete_with_bookings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.bookings where departure_location_id = old.id) then
    raise exception 'departure location has associated bookings; deactivate it instead' using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_departure_location_delete_with_bookings on public.departure_locations;
create trigger prevent_departure_location_delete_with_bookings
  before delete on public.departure_locations
  for each row execute function public.prevent_departure_location_delete_with_bookings();

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

  if v_guests > v_package.max_guests then
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
       or regexp_replace(whatsapp, '\D', '', 'g') = regexp_replace(v_customer ->> 'whatsapp', '\D', '', 'g')
    order by created_at desc
    limit 1;

  if v_customer_id is null then
    insert into public.customers (full_name, email, whatsapp, country)
    values (trim(v_customer ->> 'fullName'), lower(trim(v_customer ->> 'email')), trim(v_customer ->> 'whatsapp'), nullif(trim(coalesce(v_customer ->> 'country', '')), ''))
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
