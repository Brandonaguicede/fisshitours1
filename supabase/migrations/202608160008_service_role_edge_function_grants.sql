grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant execute on function public.create_booking_transaction(jsonb) to service_role;
grant execute on function public.record_review_attempt(text, int) to service_role;
grant execute on function public.mark_paypal_order_created(uuid, text, numeric, text, jsonb) to service_role;
grant execute on function public.mark_paypal_payment_paid(uuid, text, text, numeric, text, jsonb) to service_role;
grant execute on function public.mark_paypal_payment_unsuccessful(uuid, text, text, jsonb) to service_role;
grant execute on function public.mark_paypal_payment_refunded(uuid, text, numeric, text, jsonb) to service_role;
grant execute on function public.expire_pending_paypal_bookings() to service_role;
