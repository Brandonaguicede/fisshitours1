create table public.review_rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  window_start timestamptz not null,
  attempts int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ip_hash, window_start)
);

create trigger review_rate_limits_set_updated_at
  before update on public.review_rate_limits
  for each row execute function public.set_updated_at();

alter table public.review_rate_limits enable row level security;

create or replace function public.record_review_attempt(p_ip_hash text, p_limit int default 3)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_attempts int;
begin
  insert into public.review_rate_limits (ip_hash, window_start, attempts)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_start)
  do update set attempts = public.review_rate_limits.attempts + 1
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

revoke all on function public.record_review_attempt(text, int) from public;
grant execute on function public.record_review_attempt(text, int) to service_role;
