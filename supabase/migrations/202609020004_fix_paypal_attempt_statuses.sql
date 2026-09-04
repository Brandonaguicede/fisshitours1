alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded'));

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
        booking_status = 'confirmed',
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
    'confirmed',
    v_booking.payment_status,
    'paid',
    'PayPal payment verified and booking confirmed'
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'paypal_order_id', p_paypal_order_id,
    'paypal_capture_id', p_paypal_capture_id,
    'payment_status', 'paid',
    'booking_status', 'confirmed'
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
  v_attempt_status text;
  v_order_id text;
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

  v_attempt_status := case
    when lower(coalesce(p_status, '')) like '%cancel%' then 'cancelled'
    else 'failed'
  end;
  v_order_id := nullif(p_paypal_order_id, '');

  update public.bookings
    set payment_status = 'pending',
        booking_status = 'pending_payment'
    where id = p_booking_id
      and payment_status <> 'paid'
      and booking_status <> 'confirmed';

  if v_order_id is not null then
    update public.payments
      set status = v_attempt_status,
          raw_response = p_raw_response,
          updated_at = now()
      where booking_id = p_booking_id
        and provider = 'paypal'
        and provider_order_id = v_order_id;
  end if;

  if not found then
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
      v_order_id,
      v_booking.total_snapshot,
      v_booking.currency,
      v_attempt_status,
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
    case when v_booking.booking_status = 'confirmed' then v_booking.booking_status else 'pending_payment' end,
    v_booking.payment_status,
    case when v_booking.payment_status = 'paid' then v_booking.payment_status else 'pending' end,
    coalesce(p_status, 'PayPal payment attempt unsuccessful')
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'payment_status', case when v_booking.payment_status = 'paid' then 'paid' else 'pending' end,
    'booking_status', case when v_booking.booking_status = 'confirmed' then 'confirmed' else 'pending_payment' end,
    'attempt_status', v_attempt_status
  );
end;
$$;
