-- Google Calendar sync of confirmed bookings (V1, server-to-server with a Service Account).
-- The booking stays the source of truth: these columns only record what happened with the calendar event.
--
--   google_calendar_event_id      the ONE event of this booking (null until it is first synced)
--   google_calendar_sync_status   pending | synced | failed  (null = never synced, e.g. bookings that predate the integration)
--   google_calendar_synced_at     last successful sync
--   google_calendar_sync_error    last failure, short and free of secrets (cleared on success)

alter table public.bookings
  add column if not exists google_calendar_event_id text null,
  add column if not exists google_calendar_sync_status text null,
  add column if not exists google_calendar_synced_at timestamptz null,
  add column if not exists google_calendar_sync_error text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_google_calendar_sync_status_check' and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_google_calendar_sync_status_check
      check (google_calendar_sync_status is null or google_calendar_sync_status in ('pending', 'synced', 'failed'));
  end if;
end $$;

-- A calendar event belongs to at most one booking (idempotency guard at the database level).
create unique index if not exists bookings_google_calendar_event_id_key
  on public.bookings (google_calendar_event_id)
  where google_calendar_event_id is not null;
