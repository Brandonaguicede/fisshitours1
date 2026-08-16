create or replace function public.mark_paypal_order_created(
  p_booking_id uuid,
  p_paypal_order_id text,
  p_amount numeric,
  p_currency text,
  p_raw_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_payment_id uuid;
begin
  select *
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;

  if v_booking.id is null then
    raise exception 'booking not found' using errcode = '22023';
  end if;

  if v_booking.payment_method_key <> 'paypal' then
    raise exception 'booking payment method is not paypal' using errcode = '22023';
  end if;

  if v_booking.booking_status <> 'pending_payment' or v_booking.payment_status not in ('pending', 'processing') then
    raise exception 'booking is not ready for paypal order creation' using errcode = '22023';
  end if;

  if v_booking.expires_at is not null and v_booking.expires_at <= now() then
    raise exception 'booking payment hold has expired' using errcode = '22023';
  end if;

  if round(v_booking.total_snapshot, 2) <> round(p_amount, 2) or v_booking.currency <> p_currency then
    raise exception 'paypal amount does not match booking total' using errcode = '22023';
  end if;

  update public.bookings
    set paypal_order_id = p_paypal_order_id,
        payment_status = 'processing'
    where id = p_booking_id;

  insert into public.payments (
    booking_id,
    provider,
    provider_order_id,
    amount,
    currency,
    status,
    raw_response
  ) values (
    p_booking_id,
    'paypal',
    p_paypal_order_id,
    p_amount,
    p_currency,
    'processing',
    p_raw_response
  )
  returning id into v_payment_id;

  insert into public.booking_status_history (
    booking_id,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    note
  ) values (
    p_booking_id,
    v_booking.booking_status,
    v_booking.booking_status,
    v_booking.payment_status,
    'processing',
    'PayPal order created'
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'payment_id', v_payment_id,
    'paypal_order_id', p_paypal_order_id,
    'payment_status', 'processing',
    'booking_status', v_booking.booking_status
  );
end;
$$;

create or replace function public.mark_paypal_payment_paid(
  p_booking_id uuid,
  p_paypal_order_id text,
  p_paypal_capture_id text,
  p_amount numeric,
  p_currency text,
  p_raw_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select *
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;

  if v_booking.id is null then
    raise exception 'booking not found' using errcode = '22023';
  end if;

  if v_booking.payment_method_key <> 'paypal' then
    raise exception 'booking payment method is not paypal' using errcode = '22023';
  end if;

  if round(v_booking.total_snapshot, 2) <> round(p_amount, 2) or v_booking.currency <> p_currency then
    raise exception 'paypal amount does not match booking total' using errcode = '22023';
  end if;

  update public.bookings
    set paypal_order_id = p_paypal_order_id,
        payment_status = 'paid',
        booking_status = 'pending_confirmation',
        expires_at = null
    where id = p_booking_id;

  update public.payments
    set provider_capture_id = p_paypal_capture_id,
        amount = p_amount,
        currency = p_currency,
        status = 'paid',
        raw_response = p_raw_response,
        updated_at = now()
    where booking_id = p_booking_id
      and provider = 'paypal'
      and provider_order_id = p_paypal_order_id;

  if not found then
    insert into public.payments (
      booking_id,
      provider,
      provider_order_id,
      provider_capture_id,
      amount,
      currency,
      status,
      raw_response
    ) values (
      p_booking_id,
      'paypal',
      p_paypal_order_id,
      p_paypal_capture_id,
      p_amount,
      p_currency,
      'paid',
      p_raw_response
    );
  end if;

  insert into public.booking_status_history (
    booking_id,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    note
  ) values (
    p_booking_id,
    v_booking.booking_status,
    'pending_confirmation',
    v_booking.payment_status,
    'paid',
    'PayPal payment verified'
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'paypal_order_id', p_paypal_order_id,
    'paypal_capture_id', p_paypal_capture_id,
    'payment_status', 'paid',
    'booking_status', 'pending_confirmation'
  );
end;
$$;

create or replace function public.mark_paypal_payment_unsuccessful(
  p_booking_id uuid,
  p_paypal_order_id text,
  p_status text,
  p_raw_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select *
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;

  if v_booking.id is null then
    raise exception 'booking not found' using errcode = '22023';
  end if;

  update public.bookings
    set payment_status = 'failed',
        booking_status = 'cancelled',
        expires_at = null
    where id = p_booking_id;

  update public.availability_blocks
    set active = false
    where booking_id = p_booking_id
      and source = 'booking';

  update public.payments
    set status = 'failed',
        raw_response = p_raw_response,
        updated_at = now()
    where booking_id = p_booking_id
      and provider = 'paypal'
      and provider_order_id = p_paypal_order_id;

  insert into public.booking_status_history (
    booking_id,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    note
  ) values (
    p_booking_id,
    v_booking.booking_status,
    'cancelled',
    v_booking.payment_status,
    'failed',
    coalesce(p_status, 'PayPal payment failed')
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'payment_status', 'failed',
    'booking_status', 'cancelled'
  );
end;
$$;

create or replace function public.mark_paypal_payment_refunded(
  p_booking_id uuid,
  p_paypal_order_id text,
  p_amount numeric,
  p_currency text,
  p_raw_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select *
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;

  if v_booking.id is null then
    raise exception 'booking not found' using errcode = '22023';
  end if;

  update public.bookings
    set payment_status = 'refunded'
    where id = p_booking_id;

  update public.payments
    set status = 'refunded',
        amount = p_amount,
        currency = p_currency,
        raw_response = p_raw_response,
        updated_at = now()
    where booking_id = p_booking_id
      and provider = 'paypal'
      and provider_order_id = p_paypal_order_id;

  insert into public.booking_status_history (
    booking_id,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    note
  ) values (
    p_booking_id,
    v_booking.booking_status,
    v_booking.booking_status,
    v_booking.payment_status,
    'refunded',
    'PayPal refund/reversal recorded'
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'payment_status', 'refunded',
    'booking_status', v_booking.booking_status
  );
end;
$$;

create or replace function public.expire_pending_paypal_bookings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.bookings
    set payment_status = 'failed',
        booking_status = 'cancelled',
        expires_at = null
    where payment_method_key = 'paypal'
      and payment_status in ('pending', 'processing')
      and booking_status = 'pending_payment'
      and expires_at is not null
      and expires_at <= now();

  get diagnostics v_count = row_count;

  update public.availability_blocks ab
    set active = false
    from public.bookings b
    where ab.booking_id = b.id
      and ab.source = 'booking'
      and b.payment_method_key = 'paypal'
      and b.payment_status = 'failed'
      and b.booking_status = 'cancelled';

  return v_count;
end;
$$;

revoke all on function public.mark_paypal_order_created(uuid, text, numeric, text, jsonb) from public;
revoke all on function public.mark_paypal_payment_paid(uuid, text, text, numeric, text, jsonb) from public;
revoke all on function public.mark_paypal_payment_unsuccessful(uuid, text, text, jsonb) from public;
revoke all on function public.mark_paypal_payment_refunded(uuid, text, numeric, text, jsonb) from public;
revoke all on function public.expire_pending_paypal_bookings() from public;
grant execute on function public.mark_paypal_order_created(uuid, text, numeric, text, jsonb) to service_role;
grant execute on function public.mark_paypal_payment_paid(uuid, text, text, numeric, text, jsonb) to service_role;
grant execute on function public.mark_paypal_payment_unsuccessful(uuid, text, text, jsonb) to service_role;
grant execute on function public.mark_paypal_payment_refunded(uuid, text, numeric, text, jsonb) to service_role;
grant execute on function public.expire_pending_paypal_bookings() to service_role;
