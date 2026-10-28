-- BAC Credomatic card payments (NMI gateway: Collect.js + Gateway.js 3DS + server-side sale).
--
-- Trust model:
--   * The browser only ever holds a single-use Collect.js payment token and the
--     3DS authentication values. Card data never reaches this project.
--   * The sale is executed server-side by the bac-process-payment Edge Function
--     with the private security key, for the amount stored on the booking —
--     never an amount supplied by the browser.
--   * Every state transition goes through the security-definer functions below,
--     executable by service_role only, under a row lock on the booking.

-- 1. Catalog: allow card methods and the BAC provider -----------------------------------------
alter table public.payment_methods drop constraint if exists payment_methods_type_check;
alter table public.payment_methods add constraint payment_methods_type_check
  check (type in ('paypal', 'whatsapp_link', 'bank_transfer', 'sinpe', 'cash', 'manual', 'card'));

alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('paypal', 'manual', 'whatsapp', 'bac'));

-- At most one in-flight charge per booking: a second concurrent request cannot
-- start another sale while the first one is still waiting on the gateway.
create unique index if not exists payments_single_bac_attempt_in_flight
  on public.payments (booking_id)
  where provider = 'bac' and status = 'processing';

-- Seeded inactive on purpose: an admin enables it from "Métodos de pago" only
-- after the BAC secrets are configured and the certification tests passed.
insert into public.payment_methods (key, name, description, description_en, description_es, type, active, instructions, logo_url, sort_order)
values (
  'bac-card',
  'Credit or debit card',
  'Pay securely with Visa, Mastercard or American Express.',
  'Pay securely with Visa, Mastercard or American Express.',
  'Paga de forma segura con Visa, Mastercard o American Express.',
  'card',
  false,
  'Card payment processed by BAC Credomatic with 3-D Secure authentication.',
  null,
  3
)
on conflict (key) do nothing;

create or replace function public.is_card_payment_method(p_payment_method_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.payment_methods where key = p_payment_method_key and type = 'card');
$$;

-- 2. Payment hold -----------------------------------------------------------------------------
-- Card bookings block the boat slot while the customer pays, exactly like
-- PayPal does inside create_booking_transaction. Implemented as a trigger so
-- the booking transaction itself does not have to be redefined again.
create or replace function public.set_card_payment_hold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold_minutes int := coalesce(nullif(current_setting('app.card_payment_hold_minutes', true), '')::int, 30);
begin
  if new.expires_at is null
     and new.booking_status = 'pending_payment'
     and public.is_card_payment_method(new.payment_method_key) then
    new.expires_at := now() + make_interval(mins => v_hold_minutes);
  end if;
  return new;
end;
$$;

drop trigger if exists booking_card_payment_hold on public.bookings;
create trigger booking_card_payment_hold
  before insert on public.bookings
  for each row execute function public.set_card_payment_hold();

-- 3. Start an attempt -------------------------------------------------------------------------
create or replace function public.begin_bac_payment_attempt(p_booking_id uuid, p_max_attempts int default 3)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_attempts int;
  v_attempt_id uuid := gen_random_uuid();
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;

  if v_booking.id is null then
    raise exception 'booking not found' using errcode = '22023';
  end if;
  if not public.is_card_payment_method(v_booking.payment_method_key) then
    raise exception 'booking payment method is not card' using errcode = '22023';
  end if;
  if v_booking.payment_status = 'processing' then
    raise exception 'a card payment is already in progress' using errcode = '55P03';
  end if;
  if v_booking.booking_status <> 'pending_payment' or v_booking.payment_status <> 'pending' then
    raise exception 'booking is not ready for card payment' using errcode = '22023';
  end if;
  if v_booking.expires_at is not null and v_booking.expires_at <= now() then
    raise exception 'booking payment hold has expired' using errcode = '22023';
  end if;

  select count(*) into v_attempts from public.payments where booking_id = p_booking_id and provider = 'bac';
  if v_attempts >= greatest(coalesce(p_max_attempts, 3), 1) then
    raise exception 'card payment attempt limit reached' using errcode = '54000';
  end if;

  insert into public.payments (id, booking_id, provider, provider_order_id, amount, currency, status, raw_response)
  values (v_attempt_id, p_booking_id, 'bac', v_attempt_id::text, v_booking.total_snapshot, v_booking.currency, 'processing',
          jsonb_build_object('stage', 'started', 'attempt', v_attempts + 1));

  update public.bookings set payment_status = 'processing' where id = p_booking_id;

  insert into public.booking_status_history (booking_id, previous_booking_status, new_booking_status, previous_payment_status, new_payment_status, note)
  values (p_booking_id, v_booking.booking_status, v_booking.booking_status, v_booking.payment_status, 'processing', 'BAC card payment started');

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'amount', round(v_booking.total_snapshot, 2),
    'tax_amount', round(v_booking.tax_amount_snapshot, 2),
    'currency', v_booking.currency
  );
end;
$$;

-- 4. Record the gateway outcome ---------------------------------------------------------------
create or replace function public.complete_bac_payment_attempt(
  p_attempt_id uuid,
  p_approved boolean,
  p_transaction_id text,
  p_amount numeric,
  p_currency text,
  p_note text,
  p_raw_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_payment from public.payments where id = p_attempt_id and provider = 'bac' for update;
  if v_payment.id is null then
    raise exception 'card payment attempt not found' using errcode = '22023';
  end if;
  if v_payment.status <> 'processing' then
    raise exception 'card payment attempt is already settled' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;

  if p_approved then
    -- A charge for a different amount must never confirm a booking.
    if round(v_booking.total_snapshot, 2) <> round(p_amount, 2) or v_booking.currency <> p_currency then
      raise exception 'card amount does not match booking total' using errcode = '22023';
    end if;

    update public.payments
      set status = 'paid', provider_capture_id = p_transaction_id, amount = p_amount, currency = p_currency,
          raw_response = p_raw_response, updated_at = now()
      where id = p_attempt_id;

    update public.bookings
      set payment_status = 'paid', booking_status = 'confirmed', expires_at = null
      where id = v_booking.id;

    insert into public.booking_status_history (booking_id, previous_booking_status, new_booking_status, previous_payment_status, new_payment_status, note)
    values (v_booking.id, v_booking.booking_status, 'confirmed', v_booking.payment_status, 'paid', 'BAC card payment approved and booking confirmed');

    return jsonb_build_object('booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
      'payment_status', 'paid', 'booking_status', 'confirmed', 'transaction_id', p_transaction_id);
  end if;

  update public.payments
    set status = 'failed', provider_capture_id = nullif(p_transaction_id, ''), raw_response = p_raw_response, updated_at = now()
    where id = p_attempt_id;

  -- Return the booking to "pending" so the customer can retry within the hold
  -- window; begin_bac_payment_attempt caps the number of retries.
  update public.bookings
    set payment_status = 'pending'
    where id = v_booking.id and payment_status = 'processing';

  insert into public.booking_status_history (booking_id, previous_booking_status, new_booking_status, previous_payment_status, new_payment_status, note)
  values (v_booking.id, v_booking.booking_status, v_booking.booking_status, v_booking.payment_status, 'pending',
          left(coalesce(nullif(p_note, ''), 'BAC card payment declined'), 300));

  return jsonb_build_object('booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
    'payment_status', 'pending', 'booking_status', v_booking.booking_status);
end;
$$;

-- 5. Release abandoned holds ------------------------------------------------------------------
-- Only "pending" bookings expire. A booking left in "processing" means the
-- gateway outcome is unknown (timeout/crash): it is kept for manual
-- reconciliation in the BAC portal instead of being cancelled blindly.
create or replace function public.expire_pending_bac_bookings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  with expired as (
    update public.bookings b
      set payment_status = 'failed', booking_status = 'cancelled', expires_at = null
      where b.payment_status = 'pending'
        and b.booking_status = 'pending_payment'
        and b.expires_at is not null
        and b.expires_at <= now()
        and public.is_card_payment_method(b.payment_method_key)
      returning b.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from expired;

  update public.availability_blocks set active = false
    where booking_id = any(v_ids) and source = 'booking';

  insert into public.booking_status_history (booking_id, previous_booking_status, new_booking_status, previous_payment_status, new_payment_status, note)
  select id, 'pending_payment', 'cancelled', 'pending', 'failed', 'Card payment hold expired'
    from unnest(v_ids) as id;

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

-- 6. Permissions: server-side only ------------------------------------------------------------
revoke all on function public.is_card_payment_method(text) from public, anon, authenticated;
revoke all on function public.set_card_payment_hold() from public, anon, authenticated;
revoke all on function public.begin_bac_payment_attempt(uuid, int) from public, anon, authenticated;
revoke all on function public.complete_bac_payment_attempt(uuid, boolean, text, numeric, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.expire_pending_bac_bookings() from public, anon, authenticated;
grant execute on function public.is_card_payment_method(text) to service_role;
grant execute on function public.begin_bac_payment_attempt(uuid, int) to service_role;
grant execute on function public.complete_bac_payment_attempt(uuid, boolean, text, numeric, text, text, jsonb) to service_role;
grant execute on function public.expire_pending_bac_bookings() to service_role;
