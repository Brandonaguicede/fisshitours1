## Why

The booking flow needs an explicit, required departure-location selection so customers can choose where the boat starts and see any travel surcharge before payment.

## What Changes

- Add a fourth booking step, `Lugar de salida`, between tour details and customer/payment details.
- Load active departure locations from Supabase and render them as accessible selectable cards.
- Include the selected departure location in pricing, booking creation, summaries, confirmation, WhatsApp messages, PayPal totals, and admin reservation views.
- Add `departure_locations` plus nullable booking snapshot fields through a new migration.
- Update `create_booking_transaction` so the database validates the active location and calculates the surcharge from stored data.
- Add an admin page for creating, editing, ordering, defaulting, activating, and deactivating departure locations.

## Non-Goals

- No new payment system.
- No unnecessary PayPal, WhatsApp, or pay-on-day integration rewrite.
- No physical deletion of locations that already have associated bookings.
