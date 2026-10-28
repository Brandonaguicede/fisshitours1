-- Manual reconciliation of a BAC gateway call whose outcome is unknown (timeout / network error).
--
-- Such a call leaves its payments row "processing", which blocks every further card operation on the booking.
-- After checking the transaction in the BAC portal, an admin records the real outcome here (through the
-- admin-bac-transaction Edge Function). The settlement reuses the same functions as the automatic flows, so
-- every rule (amount match, status transitions, slot release) applies exactly as if the gateway had answered.

create or replace function public.reconcile_bac_operation(
  p_booking_id uuid,
  p_approved boolean,
  p_transaction_id text,
  p_actor uuid,
  p_min_age interval default interval '2 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_row public.payments%rowtype;
  v_transaction_id text := nullif(trim(coalesce(p_transaction_id, '')), '');
  v_note text;
  v_raw jsonb;
  v_result jsonb;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'booking not found' using errcode = '22023';
  end if;

  select * into v_row from public.payments
    where booking_id = p_booking_id and provider = 'bac' and status = 'processing'
    for update;
  if v_row.id is null then
    raise exception 'there is no pending card operation to reconcile' using errcode = '22023';
  end if;

  -- Never race a call that may still be waiting on the gateway (the Edge Function timeout is 30 seconds).
  if v_row.created_at > now() - coalesce(p_min_age, interval '2 minutes') then
    raise exception 'the card operation may still be in progress; try again in a few minutes' using errcode = '55P03';
  end if;

  if p_approved and v_transaction_id is null then
    raise exception 'the BAC transaction id is required to record an approved operation' using errcode = '22023';
  end if;
  if v_transaction_id is not null and v_transaction_id !~ '^[A-Za-z0-9-]{1,64}$' then
    raise exception 'invalid BAC transaction id' using errcode = '22023';
  end if;

  v_note := format('BAC %s reconciled manually as %s', v_row.transaction_type, case when p_approved then 'approved' else 'not processed' end);
  v_raw := jsonb_build_object('source', 'manual-reconciliation', 'actor', p_actor, 'transactionid', v_transaction_id);

  if v_row.transaction_type in ('sale', 'auth') then
    v_result := public.complete_bac_payment_attempt(v_row.id, p_approved, coalesce(v_transaction_id, ''), v_row.amount, v_row.currency, v_note, v_raw);
  else
    v_result := public.complete_bac_admin_operation(v_row.id, p_approved, coalesce(v_transaction_id, ''), v_note, v_raw);
  end if;

  return v_result || jsonb_build_object('reconciled', v_row.transaction_type, 'approved', p_approved);
end;
$$;

revoke all on function public.reconcile_bac_operation(uuid, boolean, text, uuid, interval) from public, anon, authenticated;
grant execute on function public.reconcile_bac_operation(uuid, boolean, text, uuid, interval) to service_role;
