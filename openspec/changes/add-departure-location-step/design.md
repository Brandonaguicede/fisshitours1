

## Design

The public booking flow becomes:

1. Elige tu barco
2. Detalles del tour
3. Lugar de salida
4. Tus datos y pago

`BookingPanel` keeps the existing navy visual language. The departure step uses radio inputs inside card labels so mouse, touch, and keyboard users interact with the same controls. Loading, error, and empty states block continuation until a valid active location exists and is selected.

Pricing is displayed in React for immediate feedback, but the browser is not trusted for final totals. The selected `departureLocationId` is sent to `calculate-booking-price` for display and to `create-booking` for persistence. The RPC `create_booking_transaction(payload jsonb)` loads the active location from `public.departure_locations`, adds `surcharge_amount` to `total_snapshot`, and writes snapshots into `bookings`.

Historical booking rows may have null departure fields. Admin reservation views and summaries must render those rows without crashing.

## Database

Migration `202609010001_departure_locations.sql` creates:

- `public.departure_locations`
- RLS policies for public active reads and authenticated staff management
- seed rows for Playas del Coco, Tamarindo, Las Catalinas, Playa Conchal, and Flamingo
- nullable `bookings` snapshot columns
- a replacement `create_booking_transaction` RPC that includes the surcharge

Production must have this migration applied before deploying frontend code that queries `departure_locations` or booking departure snapshot columns.
