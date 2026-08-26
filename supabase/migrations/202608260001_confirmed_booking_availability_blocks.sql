create or replace function public.sync_booking_availability_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_status = 'confirmed' then
    insert into public.availability_blocks (
      boat_id,
      tour_date,
      time_slot_id,
      reason,
      source,
      booking_id,
      active
    ) values (
      new.boat_id,
      new.tour_date,
      new.time_slot_id,
      'Confirmed booking ' || new.booking_reference,
      'booking',
      new.id,
      true
    )
    on conflict (boat_id, tour_date, time_slot_id)
      where active = true
    do update
      set reason = excluded.reason,
          source = 'booking',
          booking_id = new.id
      where public.availability_blocks.booking_id = new.id
         or public.availability_blocks.booking_id is null;
  elsif new.booking_status = 'cancelled' then
    update public.availability_blocks
      set active = false
      where booking_id = new.id
        and source = 'booking';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_sync_availability_block on public.bookings;
create trigger bookings_sync_availability_block
after insert or update of booking_status, boat_id, tour_date, time_slot_id
on public.bookings
for each row
execute function public.sync_booking_availability_block();

create or replace function public.update_booking_status(
  p_booking_id uuid,
  p_booking_status text,
  p_payment_status text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_next_payment_status text;
begin
  if not public.is_editor_or_admin() then
    raise exception 'admin or editor role required' using errcode = '42501';
  end if;

  if p_booking_status not in ('pending', 'pending_payment', 'pending_confirmation', 'confirmed', 'cancelled', 'completed') then
    raise exception 'invalid booking status' using errcode = '22023';
  end if;

  select *
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;

  if v_booking.id is null then
    raise exception 'booking not found' using errcode = '22023';
  end if;

  v_next_payment_status := coalesce(p_payment_status, v_booking.payment_status);

  if v_next_payment_status not in ('pending', 'processing', 'paid', 'failed', 'refunded', 'not_required_yet') then
    raise exception 'invalid payment status' using errcode = '22023';
  end if;

  update public.bookings
    set booking_status = p_booking_status,
        payment_status = v_next_payment_status,
        expires_at = case
          when p_booking_status in ('confirmed', 'cancelled', 'completed') then null
          else expires_at
        end
    where id = p_booking_id;

  insert into public.booking_status_history (
    booking_id,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    changed_by,
    note
  ) values (
    p_booking_id,
    v_booking.booking_status,
    p_booking_status,
    v_booking.payment_status,
    v_next_payment_status,
    auth.uid(),
    coalesce(p_note, 'Booking status updated from admin')
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'booking_status', p_booking_status,
    'payment_status', v_next_payment_status
  );
end;
$$;

revoke all on function public.sync_booking_availability_block() from public;
revoke all on function public.update_booking_status(uuid, text, text, text) from public;
grant execute on function public.update_booking_status(uuid, text, text, text) to authenticated;
