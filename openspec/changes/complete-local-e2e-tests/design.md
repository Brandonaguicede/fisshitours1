## Context

The app is a Vite/React + Supabase project ("Pura Ruta Adventures" package name, Papagayo Fishing Tours branding). It already has a local Supabase stack with 9 migrations, a seed, 9 Edge Functions, a Playwright config targeting 4 viewports, and a frontend data layer under `src/services`. The previous `api/paypal/*` directory was deleted; PayPal flows now live in Edge Functions. This change validates and fixes the local dev/test pipeline; no production changes.

## Goals / Non-Goals

**Goals:**
- Prove every local backend flow works against a fresh Supabase local instance.
- Make `npm run typecheck`, `npm run build`, and `npm run test:e2e` green.
- Validate responsive behavior at 375/768/1024/1440 px.
- Confirm the security posture (no secrets, mocks gated to local/test, public VITE_* keys only).
- Report results without committing, pushing, or touching remote services.

**Non-Goals:**
- No production/hosted Supabase work (`supabase link`, `db push`, remote).
- No reintroduction of partial payments/deposits/SINPE.
- No recreation of `api/paypal/*`.
- No weakening of RLS, auth, or validations.

## Decisions

- **Local orchestration**: use `npx supabase start` / `db reset --local` / `db lint --local` for the DB layer; Edge Functions are served by the local runtime reading `supabase/functions/.env.local`, which already sets `APP_ENV=local` and `MOCK_EXTERNAL_PROVIDERS=true`.
- **Mock gating**: mocks branch only when `APP_ENV=local`/`test` AND `MOCK_EXTERNAL_PROVIDERS=true`. Outside that, real provider paths run (and fail loudly if credentials are missing). This satisfies the "mocks only in local/test" rule without weakening production behavior.
- **Tests stay local**: E2E runs against `http://127.0.0.1:54321` and the Vite dev server; no remote host is referenced. Frontend `src/lib/supabase.ts` already throws unless public `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set.
- **Backend pricing only**: pricing is computed by `calculate-booking-price`; the frontend only displays results and stores `total_snapshot`. Second Wind rule (5 included, max 10, +$65 from guest 6) is enforced in the backend.
- **Rate limiting & double-booking**: enforced in `create-booking` via DB checks and the `202608160009_booking_rate_limits` migration; double booking returns 409, rate-limit overflow returns 429.
- **Playwright**: single worker, 4 viewport projects, `reuseExistingServer`, screenshots to `tmp-playwright/`. Responsive QA uses viewport-sized projects plus targeted checks (overflow, modals, console errors, failed requests).
- **Alternative considered**: standalone curl/supabase CLI tests for every flow. Playwright E2E covers user-visible flows; a small set of direct function invocations is used for backend-only checks (pricing math, 403/409/429, review states) where UI coverage is not meaningful.

## Risks / Trade-offs

- [Rate-limit counters shared across runs] → reset DB before the final run so counters start clean; tests that trigger 429 use a distinct window.
- [Edge runtime differences vs production] → mocks and local keys are clearly scoped; real provider paths are not exercised locally.
- [E2E timing flakiness with local DB] → generous timeouts, single worker, `reuseExistingServer`.
- [Accidental secret commits] → `.env.local` git-ignored; final scan of `src`/`dist` for secret patterns; only `VITE_*` public keys reach the frontend.

## Migration Plan

Not applicable: no schema or migration changes are introduced by this change; it validates and, where needed, fixes existing local files.

## Open Questions

None.