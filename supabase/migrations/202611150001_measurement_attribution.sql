-- Prepared only: do not apply to production without approval and privacy review.
-- One private attribution snapshot per booking. Financial tables and payment state are untouched.
create table if not exists public.measurement_attribution (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  analytics_consent boolean not null,
  marketing_consent boolean not null,
  consent_revision integer not null check (consent_revision >= 0),
  captured_at timestamptz not null,
  gclid text check (gclid is null or (char_length(gclid) between 10 and 256 and gclid ~ '^[A-Za-z0-9_-]+$')),
  gbraid text check (gbraid is null or (char_length(gbraid) between 10 and 256 and gbraid ~ '^[A-Za-z0-9_-]+$')),
  wbraid text check (wbraid is null or (char_length(wbraid) between 10 and 256 and wbraid ~ '^[A-Za-z0-9_-]+$')),
  fbp text check (fbp is null or (char_length(fbp) <= 320 and fbp ~ '^fb\.[0-9]+\.[0-9]+\.[A-Za-z0-9_-]+$')),
  fbc text check (fbc is null or (char_length(fbc) <= 320 and fbc ~ '^fb\.[0-9]+\.[0-9]+\.[A-Za-z0-9_-]+$')),
  ga_client_id text check (ga_client_id is null or ga_client_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  ga_session_id text check (ga_session_id is null or ga_session_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  created_at timestamptz not null default now(),
  check (marketing_consent or (gclid is null and gbraid is null and wbraid is null and fbp is null and fbc is null)),
  check (analytics_consent or (ga_client_id is null and ga_session_id is null))
);

alter table public.measurement_attribution enable row level security;
revoke all on table public.measurement_attribution from public, anon, authenticated;
grant select, insert, update, delete on table public.measurement_attribution to service_role;

comment on table public.measurement_attribution is
  'Private, consent-scoped attribution captured when a booking is created; never contains payment credentials.';
