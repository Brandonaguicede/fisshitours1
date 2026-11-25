-- Contact snapshots on bookings (step 1 of 2, additive and safe to apply before anything else is deployed).
--
-- customer = reusable identity, booking = the contact that was used for THAT reservation. Until now a booking only pointed at a customer
-- row and every reader (confirmation emails, Calendar, BAC, Admin, exports) read the customer's CURRENT name / email / WhatsApp, so a
-- later booking that changed them silently changed what an earlier booking showed and where its emails went.
--
--  * Three nullable columns on bookings hold the name, email and WhatsApp used for the reservation.
--  * Backfill: every existing booking gets the CURRENT values of its customer, so nothing disappears and every reservation looks exactly
--    as it does today. LIMITATION: contact data that was already overwritten in the past cannot be reconstructed (it was never stored);
--    those bookings keep the last value, as they show today.
--  * The backfill runs with user triggers disabled so it does not touch updated_at or fire any audit / status trigger of bookings.
--  * list_admin_bookings now returns the snapshot contact (under the same "customers" key) and searches it; a booking without a
--    snapshot falls back to its customer row. Writers are migrated in the next migration, AFTER the readers are deployed.

alter table public.bookings
  add column if not exists customer_name_snapshot text,
  add column if not exists customer_email_snapshot text,
  add column if not exists customer_whatsapp_snapshot text;

alter table public.bookings disable trigger user;
update public.bookings b
   set customer_name_snapshot = c.full_name,
       customer_email_snapshot = c.email,
       customer_whatsapp_snapshot = c.whatsapp
  from public.customers c
 where c.id = b.customer_id
   and b.customer_name_snapshot is null;
alter table public.bookings enable trigger user;

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
        -- The CONTACT OF THIS RESERVATION (what was used for it), not the current profile of the customer. The key keeps its old name
        -- ("customers") so the Admin listing, the edit modal and the exports keep working unchanged. A booking without a snapshot (created
        -- before the snapshots existed) falls back to its customer row.
        case when b.customer_name_snapshot is not null
               then jsonb_build_object('full_name', b.customer_name_snapshot, 'email', b.customer_email_snapshot, 'whatsapp', b.customer_whatsapp_snapshot)
             when c.id is not null
               then jsonb_build_object('full_name', c.full_name, 'email', c.email, 'whatsapp', c.whatsapp)
        end as customers,
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
          concat_ws(' ', b.booking_reference,
            -- The search looks at the contact of the reservation, same as what the listing shows.
            case when b.customer_name_snapshot is not null
                   then concat_ws(' ', b.customer_name_snapshot, b.customer_email_snapshot, b.customer_whatsapp_snapshot)
                 else concat_ws(' ', c.full_name, c.email, c.whatsapp) end,
            boat.name, t.title)
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
;
