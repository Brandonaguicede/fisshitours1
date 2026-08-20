## Purpose

Defines the observable behavior of the Papagayo Fishing Tours local Supabase backend flows (catalog, pricing, availability, booking lifecycle, payments, reviews, and image uploads) that the local test suite must validate, along with the security gates that keep mocks and credentials safe outside local/test environments.

## ADDED Requirements

### Requirement: Local database integrity
The local Supabase database SHALL apply migrations `202608160001` through `202608160009` in order, run the seed, enable Row Level Security, and start with zero bookings and zero order records.

#### Scenario: Reset applies clean migrations
- **WHEN** the local database is reset via `supabase db reset --local`
- **THEN** all nine migrations apply without error and `db lint --local` reports no issues

#### Scenario: Seed data present and bookings empty
- **WHEN** the seeded database is queried
- **THEN** boats, tours, packages, and extras are present and the bookings and orders tables are empty

#### Scenario: Partial-payment migration absent
- **WHEN** the migrations directory is inspected
- **THEN** there is no migration named `202608160010_support_partial_payments.sql`

### Requirement: Backend-only pricing
Prices SHALL be calculated only by the backend `calculate-booking-price` Edge Function, never by the frontend.

#### Scenario: Second Wind included guests and marginal pricing
- **WHEN** pricing is computed for Second Wind with up to 5 guests
- **THEN** the guests are included in the package price and no per-guest fee applies

- **WHEN** pricing is computed for Second Wind with more than 5 guests up to 10
- **THEN** each guest from the 6th onward adds USD 65 per person

#### Scenario: Extras priced from the database
- **WHEN** extras are selected during pricing
- **THEN** their unit prices come from the extras catalog in the database

### Requirement: Booking validation
The `create-booking` Edge Function SHALL reject invalid bookings and SHALL enforce exactly one booking per boat, tour, date, and time slot.

#### Scenario: Past date rejected
- **WHEN** a booking is submitted for a date in the past
- **THEN** the function rejects the request with an error

#### Scenario: Guest count bounds enforced
- **WHEN** guest count is 0, negative, or greater than 10
- **THEN** the function rejects the request

#### Scenario: Invalid references rejected
- **WHEN** the boat, tour, package, or extra reference does not exist
- **THEN** the function rejects the request

#### Scenario: Double booking returns conflict
- **WHEN** a second booking is created for the same boat, tour, date, and slot already booked
- **THEN** the second request returns HTTP 409

#### Scenario: Cancellation releases the slot
- **WHEN** an existing booking is cancelled
- **THEN** the time slot becomes available again for a new booking

### Requirement: Availability by date and slot
The `get-booking-availability` Edge Function SHALL report whether a boat/tour/date/slot is free or taken.

#### Scenario: Free slot reported available
- **WHEN** no booking exists for the requested boat, tour, date, and slot
- **THEN** the slot is reported available

#### Scenario: Booked slot reported unavailable
- **WHEN** a booking already occupies the requested boat, tour, date, and slot
- **THEN** the slot is reported unavailable

### Requirement: Turnstile security gate
Booking and review creation SHALL require a valid Turnstile token; without one the request is rejected with HTTP 403. A valid mock token in local/test SHALL permit the request to continue.

#### Scenario: Missing token rejected
- **WHEN** a booking or review is submitted without a Turnstile token
- **THEN** the function returns HTTP 403

#### Scenario: Valid mock token accepted locally
- **WHEN** a valid mock Turnstile token is submitted and `APP_ENV=local` with `MOCK_EXTERNAL_PROVIDERS=true`
- **THEN** the request proceeds

### Requirement: Booking rate limiting
Booking creation SHALL be rate limited; exceeding the limit returns HTTP 429.

#### Scenario: Limit exceeded
- **WHEN** booking requests exceed the configured window limit
- **THEN** subsequent requests return HTTP 429

### Requirement: Pay-on-day flow
A pay-on-day booking SHALL be recorded with `payment_status = not_required_yet` and `booking_status = pending_confirmation` and SHALL NOT be marked paid.

#### Scenario: Pay-on-day booking status
- **WHEN** a booking is created with pay-on-day
- **THEN** the stored payment status is `not_required_yet` and the booking status is `pending_confirmation`

### Requirement: WhatsApp flow
The WhatsApp flow SHALL create the booking before opening WhatsApp, and the generated message SHALL include the reference, client, boat, tour, package, date, time, guests, extras, and total without marking the booking as paid.

#### Scenario: Booking created before message
- **WHEN** the user requests the WhatsApp payment link
- **THEN** a booking is created first and the WhatsApp message is composed from that booking

#### Scenario: Message contents
- **WHEN** the WhatsApp URL is inspected
- **THEN** it contains the booking reference (PFT-), client name, boat, tour, package, date, time, guests, extras, and total

### Requirement: PayPal mock flow
In local/test with mocks enabled, PayPal SHALL create an order using the backend `total_snapshot`, capture the order, and only surface success when the booking's payment status is `paid`. An order that does not belong to the booking SHALL be rejected.

#### Scenario: Order created from backend total
- **WHEN** a PayPal order is created
- **THEN** the order amount comes from the backend-calculated `total_snapshot`

#### Scenario: Capture reflects payment
- **WHEN** an order is captured
- **THEN** success is shown only when the booking's payment status is `paid`

#### Scenario: Mismatched order rejected
- **WHEN** the capture references an order that does not correspond to the booking
- **THEN** the request is rejected

### Requirement: Cloudflare image mock
In local/test with mocks enabled, image uploads SHALL require authentication with an admin or editor role, validate the file, record entries in `media_assets` and `audit_log`, and prevent deletion of images in use.

#### Scenario: Auth and role enforced
- **WHEN** an unauthenticated or non-admin/editor request is made
- **THEN** the request is rejected

#### Scenario: File validated
- **WHEN** an invalid file is uploaded
- **THEN** the request is rejected

#### Scenario: Asset and audit records written
- **WHEN** a valid upload succeeds
- **THEN** a `media_assets` row and an `audit_log` row are recorded

#### Scenario: In-use image protected
- **WHEN** a delete request targets an image still referenced
- **THEN** deletion is blocked

### Requirement: Mock isolation
Mock provider behavior SHALL be active only when `APP_ENV=local` (or test) and `MOCK_EXTERNAL_PROVIDERS=true`; real provider paths are used otherwise.

#### Scenario: Mocks gated to local/test
- **WHEN** the environment is not local/test
- **THEN** mock branches are not reachable and real provider credentials are required

### Requirement: Secrets and public keys
No secrets SHALL be committed. `.env.local` SHALL be git-ignored, and the frontend SHALL only expose public `VITE_*` keys.

#### Scenario: No secrets in source or build output
- **WHEN** `src` and `dist` are scanned
- **THEN** no secret values (service-role keys, tokens, passwords) are found

#### Scenario: Local env ignored
- **WHEN** Git status is inspected
- **THEN** `.env.local` files are not tracked

### Requirement: Responsive UI at target widths
The UI SHALL render without horizontal overflow, off-screen modals, inaccessible buttons, or infinite loading states at 375, 768, 1024, and 1440 px widths, without console errors or unexpected failed requests.

#### Scenario: Layout holds across widths
- **WHEN** pages render at 375, 768, 1024, and 1440 px
- **THEN** there is no horizontal overflow, modals stay in viewport, controls are reachable, content finishes loading, and no console errors or unexpected failed requests occur