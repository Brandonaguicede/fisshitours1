-- BAC card payments: security hardening (additive).
--
--   1. Per-caller rate limit for the public card checkout (card-testing brake across bookings).
--   2. Money columns of a booking can no longer be changed straight through the API by an editor.

-- 1. Rate limit ----------------------------------------------------------------------------------------------
-- Separate from booking_rate_limits so booking creation and card attempts never consume each other's budget.
create table if not exists public.bac_payment_rate_limits (
  ip_hash text primary key,
  window_start timestamptz not null default now(),
  attempts int not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table public.bac_payment_rate_limits enable row level security;

create or replace function public.check_bac_payment_rate_limit(
  p_ip_hash text,
  p_limit int default 10,
  p_window_minutes int default 15
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window interval := make_interval(mins => greatest(p_window_minutes, 1));
  v_attempts int;
begin
  delete from public.bac_payment_rate_limits where window_start < v_now - (v_window * 4);

  insert into public.bac_payment_rate_limits (ip_hash, window_start, attempts, updated_at)
  values (p_ip_hash, v_now, 1, v_now)
  on conflict (ip_hash) do update
  set
    window_start = case
      when public.bac_payment_rate_limits.window_start < v_now - v_window then v_now
      else public.bac_payment_rate_limits.window_start
    end,
    attempts = case
      when public.bac_payment_rate_limits.window_start < v_now - v_window then 1
      else public.bac_payment_rate_limits.attempts + 1
    end,
    updated_at = v_now
  returning attempts into v_attempts;

  return v_attempts <= greatest(p_limit, 1);
end;
$$;

revoke all on table public.bac_payment_rate_limits from public, anon, authenticated;
revoke all on function public.check_bac_payment_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_bac_payment_rate_limit(text, int, int) to service_role;
grant select, insert, update, delete on table public.bac_payment_rate_limits to service_role;

-- 2. Booking money columns -----------------------------------------------------------------------------------
-- The "editor update bookings" policy lets editors update bookings through PostgREST, which would let them mark a
-- booking as paid without any gateway transaction. Direct API writes to these columns now require an admin.
-- service_role (Edge Functions) and security-definer functions run as another database user and are unaffected.
create or replace function public.guard_booking_money_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.payment_status is distinct from old.payment_status
       or new.total_snapshot is distinct from old.total_snapshot
       or new.currency is distinct from old.currency
       or new.payment_method_key is distinct from old.payment_method_key)
     and not public.is_admin() then
    raise exception 'payment fields can only be changed by an administrator' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_guard_money_columns on public.bookings;
create trigger booking_guard_money_columns
  before update on public.bookings
  for each row execute function public.guard_booking_money_columns();
