-- BAC Credomatic basic methods required for certification: Sale, Authorize, Capture, Void and Refund.
--
--   * Sale / Authorize: the customer checkout (bac-process-payment). BAC_TRANSACTION_TYPE picks which one.
--   * Capture / Void / Refund: admin operations (admin-bac-transaction) on a previous gateway transaction.
--
-- Every gateway call is one `payments` row (transaction_type + parent_payment_id), created "processing" before
-- the call and settled after it, under a row lock. The partial unique index from 202610280001 still guarantees
-- a single in-flight gateway call per booking, for customer and admin operations alike.

-- 1. Statuses --------------------------------------------------------------------------------------------------
-- authorized: funds held on the card, not charged yet (capture or void pending).
-- voided:     the authorization / unsettled sale was cancelled at the gateway; nothing was charged.
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('pending', 'processing', 'authorized', 'paid', 'failed', 'refunded', 'voided'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'processing', 'authorized', 'paid', 'failed', 'cancelled', 'refunded'));

-- 2. Transaction lineage ---------------------------------------------------------------------------------------
alter table public.payments
  add column if not exists transaction_type text,
  add column if not exists parent_payment_id uuid references public.payments(id);

update public.payments set transaction_type = 'sale' where provider = 'bac' and transaction_type is null;

alter table public.payments drop constraint if exists payments_bac_transaction_type_check;
alter table public.payments add constraint payments_bac_transaction_type_check
  check (provider <> 'bac' or transaction_type in ('sale', 'auth', 'capture', 'void', 'refund'));

create index if not exists payments_parent_payment_id_idx on public.payments (parent_payment_id);

-- 3. Customer checkout: sale or authorization ------------------------------------------------------------------
drop function if exists public.begin_bac_payment_attempt(uuid, int);

create or replace function public.begin_bac_payment_attempt(p_booking_id uuid, p_max_attempts int default 3, p_transaction_type text default 'sale')
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
  if p_transaction_type not in ('sale', 'auth') then
    raise exception 'invalid card transaction type' using errcode = '22023';
  end if;

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

  select count(*) into v_attempts from public.payments
    where booking_id = p_booking_id and provider = 'bac' and transaction_type in ('sale', 'auth');
  if v_attempts >= greatest(coalesce(p_max_attempts, 3), 1) then
    raise exception 'card payment attempt limit reached' using errcode = '54000';
  end if;

  insert into public.payments (id, booking_id, provider, transaction_type, provider_order_id, amount, currency, status, raw_response)
  values (v_attempt_id, p_booking_id, 'bac', p_transaction_type, v_attempt_id::text, v_booking.total_snapshot, v_booking.currency, 'processing',
          jsonb_build_object('stage', 'started', 'attempt', v_attempts + 1));

  update public.bookings set payment_status = 'processing' where id = p_booking_id;

  insert into public.booking_status_history (booking_id, previous_booking_status, new_booking_status, previous_payment_status, new_payment_status, note)
  values (p_booking_id, v_booking.booking_status, v_booking.booking_status, v_booking.payment_status, 'processing',
          case when p_transaction_type = 'auth' then 'BAC card authorization started' else 'BAC card payment started' end);

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'transaction_type', p_transaction_type,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'amount', round(v_booking.total_snapshot, 2),
    'tax_amount', round(v_booking.tax_amount_snapshot, 2),
    'currency', v_booking.currency
  );
end;
$$;

-- Same signature as 202610280001; an approved authorization now holds the booking instead of confirming it.
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
  v_is_auth boolean;
begin
  select * into v_payment from public.payments where id = p_attempt_id and provider = 'bac' for update;
  if v_payment.id is null or v_payment.transaction_type not in ('sale', 'auth') then
    raise exception 'card payment attempt not found' using errcode = '22023';
  end if;
  if v_payment.status <> 'processing' then
    raise exception 'card payment attempt is already settled' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  v_is_auth := v_payment.transaction_type = 'auth';

  if p_approved then
    -- A charge or hold for a different amount must never advance a booking.
    if round(v_booking.total_snapshot, 2) <> round(p_amount, 2) or v_booking.currency <> p_currency then
      raise exception 'card amount does not match booking total' using errcode = '22023';
    end if;

    update public.payments
      set status = case when v_is_auth then 'authorized' else 'paid' end,
          provider_capture_id = p_transaction_id, amount = p_amount, currency = p_currency,
          raw_response = p_raw_response, updated_at = now()
      where id = p_attempt_id;

    update public.bookings
      set payment_status = case when v_is_auth then 'authorized' else 'paid' end,
          booking_status = case when v_is_auth then 'pending_confirmation' else 'confirmed' end,
          expires_at = null
      where id = v_booking.id;

    insert into public.booking_status_history (booking_id, previous_booking_status, new_booking_status, previous_payment_status, new_payment_status, note)
    values (v_booking.id, v_booking.booking_status,
            case when v_is_auth then 'pending_confirmation' else 'confirmed' end,
            v_booking.payment_status,
            case when v_is_auth then 'authorized' else 'paid' end,
            case when v_is_auth then 'BAC card authorization approved; capture pending' else 'BAC card payment approved and booking confirmed' end);

    return jsonb_build_object('booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
      'payment_status', case when v_is_auth then 'authorized' else 'paid' end,
      'booking_status', case when v_is_auth then 'pending_confirmation' else 'confirmed' end,
      'transaction_id', p_transaction_id);
  end if;

  update public.payments
    set status = 'failed', provider_capture_id = nullif(p_transaction_id, ''), raw_response = p_raw_response, updated_at = now()
    where id = p_attempt_id;

  -- Back to "pending" so the customer can retry within the hold window (attempts are capped).
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

-- 4. Admin operations: capture, void, refund -------------------------------------------------------------------
create or replace function public.begin_bac_admin_operation(
  p_booking_id uuid,
  p_operation text,
  p_amount numeric default null,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_parent public.payments%rowtype;
  v_refunded numeric(10,2);
  v_amount numeric(10,2);
  v_operation_id uuid := gen_random_uuid();
begin
  if p_operation not in ('capture', 'void', 'refund') then
    raise exception 'invalid card operation' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'booking not found' using errcode = '22023';
  end if;
  if not public.is_card_payment_method(v_booking.payment_method_key) then
    raise exception 'booking payment method is not card' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where booking_id = p_booking_id and provider = 'bac' and status = 'processing') then
    raise exception 'a card operation is already in progress' using errcode = '55P03';
  end if;

  if p_operation = 'capture' then
    if v_booking.payment_status <> 'authorized' then
      raise exception 'booking has no authorization to capture' using errcode = '22023';
    end if;
    select * into v_parent from public.payments
      where booking_id = p_booking_id and provider = 'bac' and transaction_type = 'auth' and status = 'authorized'
      order by created_at desc limit 1;
    -- Full capture only: the booking total must equal what is charged.
    v_amount := v_parent.amount;
    if p_amount is not null and round(p_amount, 2) <> round(v_amount, 2) then
      raise exception 'only the full authorized amount can be captured' using errcode = '22023';
    end if;

  elsif p_operation = 'void' then
    if v_booking.payment_status not in ('authorized', 'paid') then
      raise exception 'booking has no card transaction to void' using errcode = '22023';
    end if;
    select * into v_parent from public.payments
      where booking_id = p_booking_id and provider = 'bac'
        and ((transaction_type = 'auth' and status = 'authorized') or (transaction_type in ('sale', 'capture') and status = 'paid'))
      order by created_at desc limit 1;
    if exists (select 1 from public.payments where parent_payment_id = v_parent.id and transaction_type = 'refund' and status = 'refunded') then
      raise exception 'a refunded transaction cannot be voided' using errcode = '22023';
    end if;
    v_amount := v_parent.amount;

  else
    if v_booking.payment_status <> 'paid' then
      raise exception 'booking has no settled card payment to refund' using errcode = '22023';
    end if;
    select * into v_parent from public.payments
      where booking_id = p_booking_id and provider = 'bac' and transaction_type in ('sale', 'capture') and status = 'paid'
      order by created_at desc limit 1;
    select coalesce(sum(amount), 0) into v_refunded from public.payments
      where parent_payment_id = v_parent.id and transaction_type = 'refund' and status = 'refunded';
    v_amount := coalesce(round(p_amount, 2), v_parent.amount - v_refunded);
    if v_amount <= 0 or v_amount > v_parent.amount - v_refunded or p_amount <> round(p_amount, 2) then
      raise exception 'refund amount must be between 0.01 and %', v_parent.amount - v_refunded using errcode = '22023';
    end if;
  end if;

  if v_parent.id is null or coalesce(v_parent.provider_capture_id, '') = '' then
    raise exception 'original card transaction not found' using errcode = '22023';
  end if;

  insert into public.payments (id, booking_id, provider, transaction_type, parent_payment_id, provider_order_id, amount, currency, status, raw_response)
  values (v_operation_id, p_booking_id, 'bac', p_operation, v_parent.id, v_operation_id::text, v_amount, v_parent.currency, 'processing',
          jsonb_build_object('stage', 'started', 'actor', p_actor));

  insert into public.booking_status_history (booking_id, previous_booking_status, new_booking_status, previous_payment_status, new_payment_status, note)
  values (p_booking_id, v_booking.booking_status, v_booking.booking_status, v_booking.payment_status, v_booking.payment_status,
          format('BAC %s of %s %s started from admin', p_operation, v_amount, v_parent.currency));

  return jsonb_build_object(
    'operation_id', v_operation_id,
    'operation', p_operation,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'gateway_transaction_id', v_parent.provider_capture_id,
    'amount', v_amount,
    'currency', v_parent.currency
  );
exception
  when unique_violation then
    raise exception 'a card operation is already in progress' using errcode = '55P03';
end;
$$;

create or replace function public.complete_bac_admin_operation(
  p_operation_id uuid,
  p_approved boolean,
  p_transaction_id text,
  p_note text,
  p_raw_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.payments%rowtype;
  v_parent public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_refunded numeric(10,2);
  v_payment_status text;
  v_booking_status text;
begin
  select * into v_operation from public.payments
    where id = p_operation_id and provider = 'bac' and transaction_type in ('capture', 'void', 'refund') for update;
  if v_operation.id is null then
    raise exception 'card operation not found' using errcode = '22023';
  end if;
  if v_operation.status <> 'processing' then
    raise exception 'card operation is already settled' using errcode = '22023';
  end if;

  select * into v_parent from public.payments where id = v_operation.parent_payment_id for update;
  select * into v_booking from public.bookings where id = v_operation.booking_id for update;
  v_payment_status := v_booking.payment_status;
  v_booking_status := v_booking.booking_status;

  if not p_approved then
    update public.payments
      set status = 'failed', provider_capture_id = nullif(p_transaction_id, ''), raw_response = p_raw_response, updated_at = now()
      where id = p_operation_id;
  elsif v_operation.transaction_type = 'capture' then
    update public.payments
      set status = 'paid', provider_capture_id = p_transaction_id, raw_response = p_raw_response, updated_at = now()
      where id = p_operation_id;
    v_payment_status := 'paid';
    v_booking_status := 'confirmed';
  elsif v_operation.transaction_type = 'void' then
    update public.payments
      set status = 'cancelled', provider_capture_id = p_transaction_id, raw_response = p_raw_response, updated_at = now()
      where id = p_operation_id;
    -- The voided transaction (and the authorization behind a voided capture) no longer holds or charges anything.
    update public.payments set status = 'cancelled', updated_at = now()
      where id in (v_parent.id, v_parent.parent_payment_id);
    update public.availability_blocks set active = false where booking_id = v_booking.id and source = 'booking';
    v_payment_status := 'voided';
    v_booking_status := 'cancelled';
  else
    update public.payments
      set status = 'refunded', provider_capture_id = p_transaction_id, raw_response = p_raw_response, updated_at = now()
      where id = p_operation_id;
    select coalesce(sum(amount), 0) into v_refunded from public.payments
      where parent_payment_id = v_parent.id and transaction_type = 'refund' and status = 'refunded';
    if v_refunded >= v_parent.amount then
      v_payment_status := 'refunded';
    end if;
  end if;

  update public.bookings
    set payment_status = v_payment_status, booking_status = v_booking_status, expires_at = null
    where id = v_booking.id;

  insert into public.booking_status_history (booking_id, previous_booking_status, new_booking_status, previous_payment_status, new_payment_status, note)
  values (v_booking.id, v_booking.booking_status, v_booking_status, v_booking.payment_status, v_payment_status,
          left(coalesce(nullif(p_note, ''), format('BAC %s %s', v_operation.transaction_type, case when p_approved then 'approved' else 'declined' end)), 300));

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'operation', v_operation.transaction_type,
    'approved', p_approved,
    'amount', v_operation.amount,
    'payment_status', v_payment_status,
    'booking_status', v_booking_status,
    'transaction_id', nullif(p_transaction_id, '')
  );
end;
$$;

-- 5. Permissions: server-side only ------------------------------------------------------------------------------
revoke all on function public.begin_bac_payment_attempt(uuid, int, text) from public, anon, authenticated;
revoke all on function public.begin_bac_admin_operation(uuid, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.complete_bac_admin_operation(uuid, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.begin_bac_payment_attempt(uuid, int, text) to service_role;
grant execute on function public.begin_bac_admin_operation(uuid, text, numeric, uuid) to service_role;
grant execute on function public.complete_bac_admin_operation(uuid, boolean, text, text, jsonb) to service_role;
