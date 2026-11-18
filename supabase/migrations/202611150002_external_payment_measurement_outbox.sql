-- Prepared only: do not apply to production without an approved migration window.
-- This records evidence for the external BAC-link flow. It never authorizes,
-- captures, refunds or otherwise calls BAC/NMI or PayPal.

create table public.external_payment_evidence (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  provider text not null check (provider = 'bac_external_link'),
  provider_reference text not null check (provider_reference ~ '^[A-Za-z0-9._/-]{4,128}$'),
  paid_at timestamptz not null,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null check (currency = 'USD'),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create table public.measurement_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  event_name text not null check (event_name = 'purchase'),
  source text not null check (source = 'external_bac_link'),
  occurred_at timestamptz not null,
  payload jsonb not null,
  destinations text[] not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'partially_delivered', 'suppressed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object'),
  check (destinations <@ array['ga4', 'google_ads', 'meta']::text[])
);

create index measurement_outbox_pending_idx
  on public.measurement_outbox (next_attempt_at, created_at)
  where status in ('pending', 'partially_delivered', 'failed');

alter table public.external_payment_evidence enable row level security;
alter table public.measurement_outbox enable row level security;
revoke all on table public.external_payment_evidence, public.measurement_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.external_payment_evidence, public.measurement_outbox to service_role;

create or replace function public.confirm_external_bac_payment(
  p_booking_id uuid,
  p_paid_at timestamptz,
  p_amount numeric,
  p_currency text,
  p_provider_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_existing public.external_payment_evidence%rowtype;
  v_attribution public.measurement_attribution%rowtype;
  v_destinations text[] := array[]::text[];
  v_status_result jsonb;
  v_measurement_queued boolean := false;
  v_transaction_id text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles where id = v_actor and active and role in ('admin', 'editor')
  ) then
    raise exception 'Admin or editor role required' using errcode = '42501';
  end if;

  if p_paid_at is null or p_paid_at > now() + interval '5 minutes' then
    raise exception 'Invalid external payment time' using errcode = '22023';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 or p_currency <> 'USD'
     or p_provider_reference is null or p_provider_reference !~ '^[A-Za-z0-9._/-]{4,128}$' then
    raise exception 'Invalid external payment evidence' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if v_booking.payment_method_key <> 'whatsapp-link' then
    raise exception 'External BAC evidence is only valid for WhatsApp-link bookings' using errcode = '22023';
  end if;
  if p_paid_at < v_booking.created_at then
    raise exception 'Payment time cannot precede booking creation' using errcode = '22023';
  end if;
  if round(p_amount, 2) <> round(v_booking.total_snapshot, 2) or p_currency <> v_booking.currency then
    raise exception 'External payment amount or currency does not match the booking' using errcode = '22023';
  end if;
  -- Must be byte-for-byte identical to _shared/measurement.ts so a future
  -- browser + server delivery pair deduplicates on one opaque event id.
  v_transaction_id := encode(digest('pft-measurement-v1:booking:' || p_booking_id::text, 'sha256'), 'hex');

  select * into v_existing from public.external_payment_evidence where booking_id = p_booking_id;
  if found then
    if v_existing.provider_reference <> p_provider_reference
       or v_existing.paid_at <> p_paid_at
       or v_existing.amount <> round(p_amount, 2)
       or v_existing.currency <> p_currency then
      raise exception 'External payment evidence already exists and is immutable' using errcode = '23505';
    end if;
  else
    insert into public.external_payment_evidence
      (booking_id, provider, provider_reference, paid_at, amount, currency, recorded_by)
    values
      (p_booking_id, 'bac_external_link', p_provider_reference, p_paid_at, round(p_amount, 2), p_currency, v_actor);
  end if;

  if v_booking.booking_status <> 'confirmed' or v_booking.payment_status <> 'paid' then
    select public.update_booking_status(
      p_booking_id,
      'confirmed',
      'paid',
      'Reserva confirmada desde admin con evidencia de pago BAC externo.'
    ) into v_status_result;
  else
    v_status_result := jsonb_build_object(
      'booking_id', v_booking.id,
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status
    );
  end if;

  select * into v_attribution from public.measurement_attribution where booking_id = p_booking_id;
  if found then
    if v_attribution.analytics_consent then v_destinations := array_append(v_destinations, 'ga4'); end if;
    if v_attribution.marketing_consent then
      v_destinations := array_append(v_destinations, 'google_ads');
      v_destinations := array_append(v_destinations, 'meta');
    end if;
  end if;

  if cardinality(v_destinations) > 0 then
    insert into public.measurement_outbox
      (event_key, booking_id, event_name, source, occurred_at, payload, destinations)
    values (
      'purchase:external_bac_link:' || p_booking_id::text,
      p_booking_id,
      'purchase',
      'external_bac_link',
      p_paid_at,
      jsonb_build_object(
        'transaction_id', v_transaction_id,
        'value', round(p_amount, 2),
        'currency', p_currency
      ),
      v_destinations
    )
    on conflict (event_key) do nothing;
    v_measurement_queued := true;
  end if;

  return v_status_result || jsonb_build_object('measurement_queued', v_measurement_queued);
end;
$$;

revoke all on function public.confirm_external_bac_payment(uuid, timestamptz, numeric, text, text) from public, anon;
grant execute on function public.confirm_external_bac_payment(uuid, timestamptz, numeric, text, text) to authenticated;

comment on table public.external_payment_evidence is
  'Immutable administrative evidence for a full external BAC-link settlement; contains no card credentials.';
comment on table public.measurement_outbox is
  'Private idempotent server-event queue. Provider delivery receipts belong in a separate delivery table/phase.';
