-- Security fix: mark_paypal_payment_unsuccessful updated the bookings row
-- with a guard against clobbering an already-paid/confirmed booking, but the
-- linked payments row had no equivalent guard. A customer who already paid
-- could call paypal-cancel-order again with their own bookingId and
-- overwrite the real PayPal capture evidence in payments.raw_response with a
-- fabricated "cancelled" record, even though the booking itself correctly
-- stayed paid/confirmed. Add the same "not already paid" guard to the
-- payments update.
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
  v_updated_payment boolean := false;
  v_row_count int;
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
        and provider_order_id = v_order_id
        and status <> 'paid';
    get diagnostics v_row_count = row_count;
    v_updated_payment := v_row_count > 0;
  end if;

  if not v_updated_payment and v_booking.payment_status <> 'paid' then
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
