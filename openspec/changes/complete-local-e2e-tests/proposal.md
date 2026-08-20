## Why

The Papagayo Fishing Tours app now depends on a local Supabase backend (Edge Functions + Postgres), but the local test suite is not proven end-to-end. We need to validate migrations, seeds, RLS, every Edge Function, payment/review/upload flows, and responsive UI on local dev before considering the work complete.

## What Changes

- Reset and validate the local Supabase database (migrations 202608160001..202608160009, seed, RLS, empty bookings).
- Start all Edge Functions with local/test mock settings (`APP_ENV=local`, `MOCK_EXTERNAL_PROVIDERS=true`).
- Run typecheck, build, and Playwright E2E suite.
- Exercise every backend flow against local Supabase: catalog, boat filters, availability, backend-only pricing (Second Wind pricing rules), extras from DB, booking creation, past-date rejection, invalid guest counts, invalid refs, double-booking 409, cancellation releasing the slot, Turnstile 403 without token, Turnstile mock pass, rate limit 429, reviews pending/rejected, pay-on-day status, WhatsApp flow, PayPal mock order/capture/mismatch, Cloudflare mock auth/validation/asset tracking/delete-protection.
- Run Playwright at 375/768/1024/1440 px and check overflow, modal bounds, accessible buttons, loading states, console errors, and unexpected failed requests.
- Security review: no secrets in `src`/`dist`, `.env.local` git-ignored, frontend only public `VITE_*` keys, mocks locked to local/test, RLS/auth/validations intact.
- Final clean pass: reset DB, lint, typecheck, build, e2e, git status/diff.

**Constraints (non-negotiable):**
- No commit, no push, no remote connection (`supabase link`, `db push`, hosted services).
- Do not delete/revert existing changes.
- Do not reintroduce deposits, 50%, partial, `required_deposit`, `remaining_balance`, or SINPE.
- Do not recreate `api/paypal/*`.
- Mocks may only function in local/test environments.
- Do not weaken RLS, authentication, or validations to make tests pass.

## Capabilities

### New Capabilities
- `backend-flows`: Behavior contracts for the local Supabase backend flows being validated (pricing, availability, booking lifecycle, payments, reviews, image uploads, security gates).

### Modified Capabilities
None.

## Impact

- `supabase/` migrations, seed, and Edge Functions.
- `src/services/*`, `src/utils/*`, `src/types/*` frontend data layer.
- `tests/e2e/*`, `playwright.config.ts`.
- Local dev environment only (no production/remote changes).