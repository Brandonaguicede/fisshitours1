# Known issues / pending tasks

## Google Calendar: physical deletion of a booking leaves its event orphaned

**Status:** open, not implemented. Registered 2026-10-07 on `development`.

`supabase/functions/_shared/google-calendar.mjs` only knows how to create/update (`upsertEvent`) and mark as cancelled
(`[CANCELADA]` prefix via `buildEvent(..., { cancelled: true })`). It has no delete operation. If a booking row is physically deleted
(admin cleanup, test-data purge, any future "delete reservation" flow), its Google Calendar event stays in the calendar as an orphan.
The FK cascade only removes the database children (`availability_blocks`, `booking_notifications`, `booking_status_history`,
`booking_changes`, `booking_extras`, `payments`).

Found while purging test bookings on 2026-10-07: the 5 events were removed with a temporary Edge Function (deleted afterwards) because
no reusable delete helper exists.

Before implementing, the two cases must be kept clearly apart:

| Case | Calendar behaviour |
|---|---|
| Commercial cancellation (customer / admin cancels a real booking) | keep the event, marked `[CANCELADA]` (current behaviour, do not change) |
| Administrative deletion / cleanup (booking row is removed) | really delete the event (`DELETE .../events/{eventId}`), treat 404/410 as already clean, and stop on any other Google error before deleting the row |

Notes for the implementation: read `google_calendar_event_id` before the delete (it is gone afterwards), reuse `getAccessToken`, and never
reuse the cancellation flow for deletions.
