-- READ-ONLY diagnostic of how customers are shared between bookings and whether the overwrite-protection trigger can act in production.
-- Run it in Supabase Dashboard -> SQL Editor of the REAL Papagayo project. Single statement, only catalog facts and counts: no phone,
-- name or email is ever selected.

select 'fn create_booking_transaction: security_definer' as metric, p.prosecdef::text as value
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking_transaction'
union all
select 'fn create_booking_transaction: owner', p.proowner::regrole::text
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_booking_transaction'
union all
select 'fn update_booking_details: security_definer', p.prosecdef::text
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'update_booking_details'
union all
select 'fn prevent_service_customer_overwrite: security_definer', p.prosecdef::text
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'prevent_service_customer_overwrite'
union all
select 'trigger prevent_service_customer_overwrite: enabled (O = yes)', t.tgenabled::text
  from pg_trigger t where t.tgname = 'prevent_service_customer_overwrite' and not t.tgisinternal
union all
select 'customers_total', count(*)::text from public.customers
union all
select 'bookings_total', count(*)::text from public.bookings
union all
select 'customers_with_more_than_one_booking', count(*)::text from (
  select customer_id from public.bookings group by customer_id having count(*) > 1
) g
union all
select 'bookings_that_share_their_customer_with_another_booking', coalesce(sum(n), 0)::text from (
  select count(*) as n from public.bookings group by customer_id having count(*) > 1
) g
-- Bookings still waiting for a payment or confirmation (their confirmation email is built from customers.email WHEN it is confirmed)
-- whose customer has a LATER booking: those are the ones a later overwrite can redirect.
union all
select 'pending_bookings_whose_customer_has_a_later_booking', count(*)::text
  from public.bookings b
  where b.booking_status in ('pending', 'pending_payment', 'pending_confirmation')
    and exists (select 1 from public.bookings later where later.customer_id = b.customer_id and later.created_at > b.created_at)
order by metric;
