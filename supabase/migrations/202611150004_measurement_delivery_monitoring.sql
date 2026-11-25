-- Prepared only: service-role monitoring without exposing payloads or customer data.
create or replace function public.measurement_delivery_health()
returns table (
  destination text,
  status text,
  delivery_count bigint,
  oldest_created_at timestamptz,
  oldest_next_attempt_at timestamptz,
  maximum_attempt_count integer,
  latest_delivered_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    d.destination,
    d.status,
    count(*) as delivery_count,
    min(d.created_at) as oldest_created_at,
    min(d.next_attempt_at) filter (where d.status = 'pending') as oldest_next_attempt_at,
    max(d.attempt_count) as maximum_attempt_count,
    max(d.delivered_at) as latest_delivered_at
  from public.measurement_deliveries d
  where coalesce(auth.role(), '') = 'service_role'
  group by d.destination, d.status
  order by d.destination, d.status;
$$;

revoke all on function public.measurement_delivery_health() from public, anon, authenticated;
grant execute on function public.measurement_delivery_health() to service_role;

comment on function public.measurement_delivery_health() is
  'Service-only aggregate health metrics; returns no event payload, booking id, receipt, token or customer data.';
