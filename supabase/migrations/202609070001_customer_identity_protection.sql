-- Public booking functions run with the service role. Customer identity fields
-- must never be overwritten as a side effect of creating another booking.
create or replace function public.prevent_service_customer_overwrite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'service_role' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_service_customer_overwrite on public.customers;
create trigger prevent_service_customer_overwrite
before update on public.customers
for each row execute function public.prevent_service_customer_overwrite();

revoke all on function public.prevent_service_customer_overwrite() from public;
grant execute on function public.prevent_service_customer_overwrite() to service_role;
