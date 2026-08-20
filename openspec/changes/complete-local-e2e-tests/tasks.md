## 1. Environment and Database

- [x] 1.1 Confirm `docker version` and `npx supabase status`; start Supabase with `npx supabase start` if not active
- [x] 1.2 Run `npx supabase db reset --local` and `npx supabase db lint --local`
- [x] 1.3 Verify migrations 202608160001..202608160009 applied, seed ran, RLS enabled, bookings empty, and no `202608160010_support_partial_payments.sql`

## 2. Edge Functions

- [x] 2.1 Confirm all 9 Edge Functions start with `supabase/functions/.env.local` (`APP_ENV=local`, `MOCK_EXTERNAL_PROVIDERS=true`)
- [x] 2.2 Verify create-booking, calculate-booking-price, get-booking-availability are reachable
- [x] 2.3 Verify paypal-create-order, paypal-capture-order, paypal-webhook are reachable
- [x] 2.4 Verify create-review, cloudflare-upload-image, cloudflare-delete-image are reachable

## 3. Static Checks

- [x] 3.1 Run `npm run typecheck` and fix errors
- [x] 3.2 Run `npm run build` and fix errors
- [x] 3.3 Run `npm run test:e2e` and fix failures

## 4. Backend Flow Validation Against Local Supabase

- [x] 4.1 Catalog from Supabase; tours filtered by boat
- [x] 4.2 Availability by date and slot
- [x] 4.3 Backend-only pricing incl. Second Wind rules and DB extras
- [x] 4.4 Valid booking creation
- [x] 4.5 Past-date, guest-count (0, negative, >10), and invalid-ref rejections
- [x] 4.6 Double booking returns 409
- [x] 4.7 Cancellation releases the slot
- [x] 4.8 Turnstile missing token 403; valid mock passes
- [x] 4.9 Rate limit 429
- [x] 4.10 Review valid -> pending; review without Turnstile rejected
- [x] 4.11 Pay-on-day statuses (`not_required_yet`, `pending_confirmation`)
- [x] 4.12 WhatsApp flow ordering, message contents, not-marked-paid
- [x] 4.13 PayPal mock order (backend total_snapshot), capture, paid-only success, mismatched order rejection
- [x] 4.14 Cloudflare mock auth/role, file validation, media_assets+audit_log, in-use delete protection

## 5. Responsive Playwright QA

- [x] 5.1 Run Playwright at 375, 768, 1024, 1440 px
- [x] 5.2 Check horizontal overflow, off-screen modals, inaccessible buttons, infinite loading, console errors, unexpected failed requests

## 6. Security Review

- [x] 6.1 Scan src and dist for secrets
- [x] 6.2 Confirm `.env.local` is git-ignored
- [x] 6.3 Confirm frontend only exposes public `VITE_*` keys
- [x] 6.4 Confirm mocks blocked outside local/test; RLS/auth/validations intact

## 7. Final Verification and Report

- [x] 7.1 Re-run `supabase db reset --local`, `db lint --local`, typecheck, build, e2e, `git status --short`, `git diff --stat`
- [x] 7.2 Deliver numbered report (approved/failed tests, errors, fixes, modified files, payment flow status, security status, pending risks, no-commit/push/remote confirmation)