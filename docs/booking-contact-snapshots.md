# Booking contact snapshots (customer = identity, booking = contact used)

## The problem this fixes
A booking only pointed at a `customers` row, and every reader (confirmation emails, Calendar, BAC, Admin, exports) read the customer's
**current** name / email / WhatsApp. `create_booking_transaction` overwrote those three fields of an existing customer on every new booking,
and the Admin edit of a reservation did the same. So a later booking changed what an earlier one showed and where its confirmation went
(a pending booking confirmed later was e-mailed to the newest address). The `prevent_service_customer_overwrite` trigger never prevented
it: it only acts when `current_user = 'service_role'`, but every writer is `SECURITY DEFINER` (there `current_user` is the function owner)
and no code updates `customers` directly.

## The model
- `customers` = reusable identity. A booking finds it (email, exact phone digits, or `phone_match_key`) or creates it once. It is **never
  updated** by a booking or by an Admin edit.
- `bookings.customer_name_snapshot / customer_email_snapshot / customer_whatsapp_snapshot` = what was typed for THAT reservation.
  Every reader uses them through `supabase/functions/_shared/booking-contact.mjs` (`getBookingContact`): snapshot first; a booking with no
  snapshot (created before the columns existed) falls back to its customer. A snapshotted booking with a null email means "no email" and is
  not replaced by the customer's.
- `list_admin_bookings` keeps its JSON shape: the `customers` object it returns is now **the contact of the reservation**, not necessarily
  the current customer. The listing, the edit modal, the search and the exports therefore need no change.
- The dashboard "Reservas recientes" shows the name of each reservation (snapshot, fallback customer).
- Editing a reservation in the Admin edits only its snapshots. The customer's `country` is no longer edited from there.

## Phone matching (`phone_match_key`)
One comparable value per phone, used only to find an existing customer: digits; with `+` / `00` the international digits; with no prefix
and exactly 8 digits a legacy Costa Rican number (`506` + digits). `85331728`, `50685331728` and `+50685331728` are the same customer;
distinct international numbers are never merged; 9-digit or other unprefixed numbers are not guessed. The TypeScript twin is
`phoneMatchKey` in `src/utils/phoneNumber.ts` and a test runs both on the same inputs.

## Migrations
1. `202611240002_booking_contact_snapshots.sql` (additive): three nullable columns, backfill from the current customer (user triggers
   disabled so `updated_at` and audits are untouched), and `list_admin_bookings` reading the snapshots with fallback.
2. `202611240003_booking_contact_writers.sql`: one version of `create_booking_transaction` (no customer update, writes snapshots,
   `phone_match_key`), `update_booking_details` (snapshots only), and removal of the dead trigger and its function.
   `202611240001_booking_leads.sql` is independent of both.

**Limitation:** contact data that was already overwritten in the past cannot be reconstructed (it was never stored). Existing bookings are
backfilled with their customer's current values, so they look exactly as they do today.

## Deploy order (nothing disappears, no confirmation goes to the wrong address, no new booking overwrites a customer)
1. Run `scripts/audit-customer-phones.sql` and `scripts/audit-customer-overwrite.sql` in the Supabase SQL Editor of the real project.
2. Apply `202611240001` (leads) and `202611240002` (snapshots). Both are additive; old code keeps working (old bookings have no snapshot and fall back).
3. Deploy the Edge Functions: `save-booking-lead` (new), `create-booking`, `bac-process-payment`, `admin-confirm-booking`,
   `admin-retry-confirmation-email`, and every function that imports `_shared/booking-confirmation-email.ts` or `_shared/google-calendar.mjs`
   (`paypal-capture-order`, `paypal-webhook`, `admin-bac-transaction`, `sync-reservation-calendar`, `admin-cancel-booking`).
4. Apply `202611240003` (writers). **Only now** does a booking stop updating the customer; every reader already uses snapshots.
5. Deploy the frontend (international phone, lead capture, dashboard).

Why not earlier: applying 3 before step 3 would leave an old reader on a customer row that is no longer updated (a returning customer's new
booking would be confirmed to the old address). Applying the frontend before 2 is harmless for the checkout but loses the lead.

## Pending
- Privacy Policy: confirm it says that contact data entered during a booking attempt may be kept temporarily (up to 30 days if the booking is
  not completed). No legal text is written here.
- After a few days with no snapshot-less bookings, a follow-up migration can make `customer_name_snapshot` NOT NULL and the fallback can go.
