create table public.booking_rate_limits (
  ip_hash text primary key,
  window_start timestamptz not null default now(),
  attempts int not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table public.booking_rate_limits enable row level security;

create or replace function public.check_booking_rate_limit(
  p_ip_hash text,
  p_limit int default 8,
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
  delete from public.booking_rate_limits
  where window_start < v_now - (v_window * 4);

  insert into public.booking_rate_limits (ip_hash, window_start, attempts, updated_at)
  values (p_ip_hash, v_now, 1, v_now)
  on conflict (ip_hash) do update
  set
    window_start = case
      when public.booking_rate_limits.window_start < v_now - v_window then v_now
      else public.booking_rate_limits.window_start
    end,
    attempts = case
      when public.booking_rate_limits.window_start < v_now - v_window then 1
      else public.booking_rate_limits.attempts + 1
    end,
    updated_at = v_now
  returning attempts into v_attempts;

  return v_attempts <= greatest(p_limit, 1);
end;
$$;

revoke all on table public.booking_rate_limits from public;
revoke all on function public.check_booking_rate_limit(text, int, int) from public;
grant execute on function public.check_booking_rate_limit(text, int, int) to service_role;
grant select, insert, update, delete on table public.booking_rate_limits to service_role;
