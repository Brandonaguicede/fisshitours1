-- Prepared only: do not apply without a reviewed migration window.
-- Per-provider delivery state is separate from the canonical purchase outbox.

create table public.measurement_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.measurement_outbox(id) on delete cascade,
  destination text not null check (destination in ('ga4', 'google_ads', 'meta')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'suppressed', 'dead')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  receipt text check (receipt is null or length(receipt) <= 256),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_.:-]{1,128}$'),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outbox_id, destination)
);

create index measurement_deliveries_claim_idx
  on public.measurement_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'processing');

alter table public.measurement_deliveries enable row level security;
revoke all on table public.measurement_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.measurement_deliveries to service_role;

create or replace function public.seed_measurement_deliveries()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.measurement_deliveries (outbox_id, destination)
  select new.id, destination
  from unnest(new.destinations) destination
  on conflict (outbox_id, destination) do nothing;
  return new;
end;
$$;

revoke all on function public.seed_measurement_deliveries() from public, anon, authenticated;
grant execute on function public.seed_measurement_deliveries() to service_role;

drop trigger if exists measurement_outbox_seed_deliveries on public.measurement_outbox;
create trigger measurement_outbox_seed_deliveries
after insert on public.measurement_outbox
for each row execute function public.seed_measurement_deliveries();

-- Backfill canonical events created between migration 002 and this migration.
insert into public.measurement_deliveries (outbox_id, destination)
select o.id, destination
from public.measurement_outbox o
cross join lateral unnest(o.destinations) destination
on conflict (outbox_id, destination) do nothing;

create or replace function public.claim_measurement_delivery(
  p_destinations text[],
  p_lease_seconds integer default 60
)
returns table (
  delivery_id uuid,
  destination text,
  attempt_count integer,
  booking_id uuid,
  occurred_at timestamptz,
  payload jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_destinations is null or cardinality(p_destinations) = 0
     or not (p_destinations <@ array['ga4', 'meta']::text[])
     or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid delivery claim parameters' using errcode = '22023';
  end if;

  select d.id into v_id
  from public.measurement_deliveries d
  where d.destination = any(p_destinations)
    and d.attempt_count < 8
    and (
      (d.status = 'pending' and d.next_attempt_at <= now())
      or (d.status = 'processing' and d.lease_expires_at < now())
    )
  order by d.next_attempt_at, d.created_at, d.id
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  return query
  update public.measurement_deliveries d
  set status = 'processing',
      attempt_count = d.attempt_count + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  from public.measurement_outbox o
  where d.id = v_id and o.id = d.outbox_id
  returning d.id, d.destination, d.attempt_count, o.booking_id, o.occurred_at, o.payload;
end;
$$;

create or replace function public.complete_measurement_delivery(
  p_delivery_id uuid,
  p_outcome text,
  p_retryable boolean default false,
  p_receipt text default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery public.measurement_deliveries%rowtype;
  v_outbox_id uuid;
  v_next_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_outcome not in ('delivered', 'suppressed', 'failed')
     or p_receipt is not null and length(p_receipt) > 256
     or p_error_code is not null and p_error_code !~ '^[A-Z0-9_.:-]{1,128}$' then
    raise exception 'invalid delivery completion' using errcode = '22023';
  end if;

  select * into v_delivery from public.measurement_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'delivery not found' using errcode = 'P0002'; end if;
  if v_delivery.status <> 'processing' or v_delivery.lease_expires_at < now() then
    raise exception 'delivery lease is not active' using errcode = '40001';
  end if;

  v_next_status := case
    when p_outcome = 'delivered' then 'delivered'
    when p_outcome = 'suppressed' then 'suppressed'
    when p_retryable and v_delivery.attempt_count < 8 then 'pending'
    else 'dead'
  end;

  update public.measurement_deliveries
  set status = v_next_status,
      next_attempt_at = case when v_next_status = 'pending'
        then now() + make_interval(secs => least(21600, 30 * power(2, greatest(0, v_delivery.attempt_count - 1))::integer))
        else next_attempt_at end,
      lease_expires_at = null,
      receipt = case when v_next_status = 'delivered' then p_receipt else null end,
      error_code = case when v_next_status in ('pending', 'dead', 'suppressed') then p_error_code else null end,
      delivered_at = case when v_next_status = 'delivered' then now() else null end,
      updated_at = now()
  where id = p_delivery_id
  returning outbox_id into v_outbox_id;

  update public.measurement_outbox o
  set status = case
        when not exists (select 1 from public.measurement_deliveries d where d.outbox_id = v_outbox_id and d.status not in ('delivered', 'suppressed')) then 'delivered'
        when exists (select 1 from public.measurement_deliveries d where d.outbox_id = v_outbox_id and d.status = 'delivered') then 'partially_delivered'
        when exists (select 1 from public.measurement_deliveries d where d.outbox_id = v_outbox_id and d.status = 'dead')
             and not exists (select 1 from public.measurement_deliveries d where d.outbox_id = v_outbox_id and d.status in ('pending', 'processing')) then 'failed'
        else 'pending'
      end,
      attempt_count = (select coalesce(sum(d.attempt_count), 0)::integer from public.measurement_deliveries d where d.outbox_id = v_outbox_id),
      next_attempt_at = coalesce((select min(d.next_attempt_at) from public.measurement_deliveries d where d.outbox_id = v_outbox_id and d.status = 'pending'), o.next_attempt_at),
      last_error = case when v_next_status in ('dead', 'pending') then p_error_code else null end,
      updated_at = now()
  where o.id = v_outbox_id;
end;
$$;

revoke all on function public.claim_measurement_delivery(text[], integer) from public, anon, authenticated;
revoke all on function public.complete_measurement_delivery(uuid, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.claim_measurement_delivery(text[], integer) to service_role;
grant execute on function public.complete_measurement_delivery(uuid, text, boolean, text, text) to service_role;

comment on table public.measurement_deliveries is
  'Private per-provider delivery state with bounded retries and expiring leases; contains no customer identifiers.';
