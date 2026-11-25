# Booking attempts ("leads")

Contact data typed in the last booking step is kept even if the person leaves before paying, so the team can follow up.
A lead is **not** a booking: no reference, no held slot, no payment, no Calendar event, no `customers` row.

## How it works

| Piece | Where |
| --- | --- |
| Table, RLS, RPCs, retention job | `supabase/migrations/202611240001_booking_leads.sql` |
| Save endpoint | `supabase/functions/save-booking-lead/index.ts` |
| Conversion (after the booking exists) | `supabase/functions/create-booking/index.ts` (`leadToken`) |
| Capture (step 3, debounce 1.5 s) | `src/components/booking/BookingPanel.tsx` |
| Pure helpers (payload, token, abandonment, links) | `src/utils/bookingLead.ts` |
| International phone capture | `src/utils/phoneNumber.ts` |
| Admin view (Reservas → "Intentos de reserva") | `src/components/admin/AdminBookingLeadsSection.tsx` |

- **Identity:** a lead is identified only by its `client_token` (random uuid, kept in `sessionStorage`). Leads are never matched by name,
  email or WhatsApp: two people sharing an email or phone are two leads.
- **Abandonment** is derived, never stored: `status = 'open'` and no activity for 60 minutes.
- **Conversion:** `create-booking` creates the booking normally and then marks the lead converted (best effort; a failure is logged with
  ids only and never undoes the booking). The personal data of a converted lead is wiped: the booking/customer hold it.
- **Retention:** open leads are deleted 30 days after their last activity (`purge_booking_leads()`, scheduled daily at 03:15 with the
  `pg_cron` the project already uses; if the extension is missing, run the function by hand). Converted leads hold no personal data.
- **Security:** RLS on, read-only policy for staff, no anonymous access, writes only through the service role (Edge Function).
  Separate rate-limit bucket (`lead:` + IP). Nothing is sent to GA4; no contact data is logged.

## International phone

The customer picks the country prefix in a selector (Costa Rica is only the **initial** value) and types the national number; typing a
number that starts with `+` or `00` is taken as already international and wins over the selector. The number is stored in E.164
(`+50688881234`), and the Admin opens `wa.me/<digits>` with exactly that value. Nothing is inferred from the length of the digits: a
number that does not fit the chosen prefix (Costa Rica = 8 digits, +1 = 10 digits) is rejected with an explanation. The same normalized
value is sent to the booking.

## Deploy order

1. Apply the migration.
2. Deploy `save-booking-lead` (needs `RATE_LIMIT_HASH_SECRET`, already used by `create-booking`).
3. Deploy `create-booking` (adds the optional `leadToken`) and then the frontend.

If the frontend goes out first, saving the attempt fails silently; the checkout keeps working.

## Pending before this is considered closed for production

- **Privacy Policy review.** Confirm that the Privacy Policy tells visitors that the contact data they enter during a booking attempt
  may be kept temporarily (up to 30 days if the booking is not completed) to follow up on their request. No legal text is written here.
- Admin view shows the 200 most recent attempts; add pagination if volume grows.
