-- Booking attempts ("leads"): contact data the customer typed in the last booking step, kept even if they leave before paying.
--
-- This is deliberately NOT a booking: a lead has no reference, holds no slot (no availability_blocks row), has no payment, no
-- Calendar event and no customers row. It is only "this person was interested", so the team can follow up.
--
--  * Identity of a lead is its client_token (a random uuid the browser keeps for the session). A lead is never matched by
--    name, email or WhatsApp: two people sharing an email/phone are two leads, and one never overwrites the other.
--  * Written only by Edge Functions with the service role (RPCs below). No anonymous read or write exists.
--  * Catalog columns are plain text snapshots with NO foreign keys, so deleting a historical tour/package never destroys or
--    invalidates a lead. The labels are resolved on the server from the catalog; the client never supplies them.
--  * Retention: an open lead is deleted 30 days after its last activity (purge_booking_leads, scheduled below when pg_cron is
--    available). When a lead converts into a booking, the personal data is wiped from the lead: the booking/customer already hold it.

create table public.booking_leads (
  id uuid primary key default gen_random_uuid(),
  client_token uuid not null unique,
  status text not null default 'open' check (status in ('open', 'converted')),
  full_name text check (full_name is null or char_length(full_name) between 2 and 120),
  email text check (email is null or char_length(email) between 5 and 254),
  -- International format (E.164) built by the checkout from an explicit country prefix: wa.me uses exactly this value, nothing is inferred.
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  language text not null default 'es' check (language in ('es', 'en')),
  -- What the customer actually went through. Null = not confirmed by the customer (never a technical default).
  boat_id text,
  tour_id text,
  tour_package_id text,
  tour_date date,
  time_slot_id text,
  guests int check (guests is null or guests between 1 and 99),
  -- Human-readable names resolved server-side at save time (history survives catalog edits and deletions).
  boat_name text,
  tour_title text,
  package_name text,
  time_slot_label text,
  booking_id uuid references public.bookings(id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An open lead always carries the three contact fields; a converted one has had them wiped (the booking holds them).
  constraint booking_leads_open_has_contact check (
    status = 'converted' or (full_name is not null and email is not null and whatsapp is not null)
  ),
  constraint booking_leads_converted_has_timestamp check (status = 'open' or converted_at is not null)
);

create index booking_leads_status_updated_idx on public.booking_leads (status, updated_at desc);
create index booking_leads_booking_idx on public.booking_leads (booking_id) where booking_id is not null;

alter table public.booking_leads enable row level security;

-- Read-only for staff (admin / editor / viewer, same as customers and bookings). No insert/update/delete policy for anyone:
-- every write goes through the service-role RPCs below.
create policy "staff read booking leads" on public.booking_leads
  for select to authenticated using (public.is_admin_editor_viewer());

revoke all on table public.booking_leads from public, anon, authenticated;
grant select on table public.booking_leads to authenticated;
grant select, insert, update, delete on table public.booking_leads to service_role;

-- Creates the lead for a client_token, or updates THAT lead. Never looks at email/WhatsApp/name to find an existing row.
create or replace function public.upsert_booking_lead(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_customer jsonb := p -> 'customer';
  v_context jsonb := coalesce(p -> 'context', '{}'::jsonb);
  v_name text := nullif(btrim(regexp_replace(coalesce(v_customer ->> 'fullName', ''), '\s+', ' ', 'g')), '');
  v_email text := lower(nullif(btrim(coalesce(v_customer ->> 'email', '')), ''));
  v_whatsapp text := nullif(btrim(coalesce(v_customer ->> 'whatsapp', '')), '');
  v_language text := coalesce(nullif(p ->> 'language', ''), 'es');
  v_boat_id text := nullif(v_context ->> 'boatId', '');
  v_tour_id text := nullif(v_context ->> 'tourId', '');
  v_package_id text := nullif(v_context ->> 'tourPackageId', '');
  v_time_slot_id text := nullif(v_context ->> 'timeSlotId', '');
  v_tour_date date := null;
  v_guests int := null;
  v_boat_name text;
  v_tour_title text;
  v_package_name text;
  v_time_label text;
  v_existing public.booking_leads%rowtype;
begin
  begin
    v_token := (p ->> 'clientToken')::uuid;
  exception when others then
    raise exception 'LEAD_TOKEN_INVALID' using errcode = '22023';
  end;
  if v_token is null then raise exception 'LEAD_TOKEN_INVALID' using errcode = '22023'; end if;

  -- Incomplete contact data never creates a row (no garbage leads).
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120
     or v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254
     or v_whatsapp is null or v_whatsapp !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'LEAD_CONTACT_INVALID' using errcode = '22023';
  end if;
  if v_language not in ('es', 'en') then raise exception 'LEAD_LANGUAGE_INVALID' using errcode = '22023'; end if;

  begin
    if nullif(v_context ->> 'tourDate', '') is not null then v_tour_date := (v_context ->> 'tourDate')::date; end if;
    if nullif(v_context ->> 'guests', '') is not null then v_guests := (v_context ->> 'guests')::int; end if;
  exception when others then
    raise exception 'LEAD_CONTEXT_INVALID' using errcode = '22023';
  end;
  if v_guests is not null and (v_guests < 1 or v_guests > 99) then v_guests := null; end if;

  -- Labels come from the catalog, never from the client. An id that does not exist simply yields no label.
  if v_boat_id is not null then select name into v_boat_name from public.boats where id = v_boat_id; end if;
  if v_tour_id is not null then select title into v_tour_title from public.tours where id = v_tour_id; end if;
  if v_package_id is not null then select name into v_package_name from public.tour_packages where id = v_package_id; end if;
  if v_time_slot_id is not null then select label into v_time_label from public.time_slots where id = v_time_slot_id; end if;

  select * into v_existing from public.booking_leads where client_token = v_token for update;

  if v_existing.id is null then
    insert into public.booking_leads (
      client_token, full_name, email, whatsapp, language,
      boat_id, tour_id, tour_package_id, tour_date, time_slot_id, guests,
      boat_name, tour_title, package_name, time_slot_label
    ) values (
      v_token, v_name, v_email, v_whatsapp, v_language,
      v_boat_id, v_tour_id, v_package_id, v_tour_date, v_time_slot_id, v_guests,
      v_boat_name, v_tour_title, v_package_name, v_time_label
    );
    return jsonb_build_object('saved', true, 'created', true);
  end if;

  -- A converted lead is history: a late request from the same browser must not reopen it or put personal data back.
  if v_existing.status = 'converted' then
    return jsonb_build_object('saved', false, 'converted', true);
  end if;

  -- Same session, nothing changed: do not touch updated_at (it is the "last activity" the abandonment rule reads).
  if (v_existing.full_name, v_existing.email, v_existing.whatsapp, v_existing.language,
      v_existing.boat_id, v_existing.tour_id, v_existing.tour_package_id, v_existing.tour_date, v_existing.time_slot_id, v_existing.guests)
     is not distinct from
     (v_name, v_email, v_whatsapp, v_language, v_boat_id, v_tour_id, v_package_id, v_tour_date, v_time_slot_id, v_guests) then
    return jsonb_build_object('saved', true, 'created', false, 'changed', false);
  end if;

  update public.booking_leads set
    full_name = v_name, email = v_email, whatsapp = v_whatsapp, language = v_language,
    boat_id = v_boat_id, tour_id = v_tour_id, tour_package_id = v_package_id, tour_date = v_tour_date,
    time_slot_id = v_time_slot_id, guests = v_guests,
    boat_name = v_boat_name, tour_title = v_tour_title, package_name = v_package_name, time_slot_label = v_time_label,
    updated_at = now()
  where id = v_existing.id;
  return jsonb_build_object('saved', true, 'created', false, 'changed', true);
end;
$$;

-- Marks the lead of this session as converted into a real booking and wipes its personal data (the booking/customer own it now).
-- Looks the lead up by token only. A token that matches nothing (or an already converted lead) is a harmless no-op.
create or replace function public.mark_booking_lead_converted(p_token uuid, p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_token is null or p_booking_id is null then return false; end if;
  update public.booking_leads set
    status = 'converted',
    booking_id = p_booking_id,
    converted_at = now(),
    full_name = null, email = null, whatsapp = null,
    updated_at = now()
  where client_token = p_token and status = 'open'
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- Retention: open leads are removed 30 days after their last activity. Converted leads hold no personal data and are kept as a trace.
create or replace function public.purge_booking_leads()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.booking_leads where status = 'open' and updated_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.upsert_booking_lead(jsonb) from public, anon, authenticated;
revoke all on function public.mark_booking_lead_converted(uuid, uuid) from public, anon, authenticated;
revoke all on function public.purge_booking_leads() from public, anon, authenticated;
grant execute on function public.upsert_booking_lead(jsonb) to service_role;
grant execute on function public.mark_booking_lead_converted(uuid, uuid) to service_role;
grant execute on function public.purge_booking_leads() to service_role;

-- Daily purge with the pg_cron extension this project already uses (see 202609070005_process_booking_emails_cron.sql). It is pure
-- SQL (no HTTP call, no Vault secret). If the extension is missing the migration still applies; run purge_booking_leads() by hand.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-booking-leads';
    perform cron.schedule('purge-booking-leads', '15 3 * * *', 'select public.purge_booking_leads();');
  else
    raise notice 'pg_cron is not installed: schedule public.purge_booking_leads() manually (daily).';
  end if;
end;
$$;
