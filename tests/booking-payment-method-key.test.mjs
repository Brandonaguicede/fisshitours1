// Demonstrates the payment-method key/type bug and its fix: a row can share
// a `type` with a default method (paypal) while having its own distinct
// `key` — the booking must be persisted with THAT row's real key, never a
// hardcoded default. Reuses the same interaction steps as
// tests/e2e/papagayo.spec.ts's WhatsApp flow, but against page.route mocks
// (no local Supabase) so it runs under `npm run test:admin` / .env.test.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';

async function choosePackage(page, amount) {
  await page.locator('main label').filter({ hasText: amount }).first().click();
}
async function chooseTimeSlot(page, label) {
  await page.locator('main label').filter({ hasText: label }).first().click();
}
async function chooseDepartureLocation(page, label) {
  await page.locator('main label').filter({ hasText: label }).first().click();
}

async function fixture(paymentMethods) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });
  const createBookingRequests = [];

  // Real (minimal) catalog rows, shaped to match mapBoat/mapBoatTour exactly —
  // returning an error here to force the static-data fallback was tried
  // first, but React Query's retry/backoff on the failed query pushed page
  // load well past a reasonable action timeout, so this returns valid rows
  // for the real query path instead.
  const boatRow = { id: 'boat-1', slug: 'second-wind', name: 'Second Wind', image_url: null, images: null, badge: null, length: '32ft', engine: 'Yamaha 250', max_guests: 10, featured_spec: null, active: true, sort_order: 1 };
  const tourPackageRow = {
    id: 'pkg-1', active: true, name: 'Half Day', package_type: 'half-day', departure_times: null, meal_options: null,
    description: 'Half day fishing', package_included: null, duration_minutes: 240, sort_order: 1,
    base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, custom_quote: false,
    boat_tours: {
      id: 'link-1', boat_id: 'boat-1', tour_id: 'tour-1', active: true,
      boats: { active: true, max_guests: 10 },
      tours: { id: 'tour-1', title: 'Fishing Tour', category: 'Fishing', description: 'Half day fishing trip', image_url: null, included: null, highlights: null, active: true },
    },
  };
  const timeSlotRow = { id: 'slot-1', label: 'Morning', starts_at: '07:00:00' };

  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith('/boats')) return route.fulfill({ json: [boatRow] });
    if (path.endsWith('/tour_packages')) return route.fulfill({ json: [tourPackageRow] });
    if (path.endsWith('/time_slots')) return route.fulfill({ json: [timeSlotRow] });
    if (path.endsWith('/tour_images') || path.endsWith('/tour_inclusions')) return route.fulfill({ json: [] });
    if (path.endsWith('/departure_locations')) {
      return route.fulfill({ json: [{ id: 'loc-1', name: 'Playas del Coco', slug: 'playas-del-coco', description: '', surcharge_amount: 0, currency: 'USD', active: true, sort_order: 1, is_default: true }] });
    }
    // getActivePaymentMethods() queries `.eq('active', true)` server-side —
    // replicate that filtering here rather than relying on the frontend to
    // do it (it doesn't; only `active` gates availability, per the fix).
    if (path.endsWith('/payment_methods')) return route.fulfill({ json: paymentMethods.filter((method) => method.active) });
    if (path.endsWith('/functions/v1/get-booking-availability')) return route.fulfill({ json: { slots: [{ id: 'slot-1', label: 'Morning', time: '07:00', available: true }] } });
    if (path.endsWith('/functions/v1/calculate-booking-price')) {
      return route.fulfill({ json: { custom_quote: false, base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, extra_guests: 0, extra_guests_total: 0, extras: [], extras_total: 0, total: 650, currency: 'USD' } });
    }
    if (path.endsWith('/functions/v1/create-booking')) {
      createBookingRequests.push(request.postDataJSON());
      return route.fulfill({ json: { booking_id: 'booking-1', booking_reference: 'PFT-TEST01', boat_id: 'second-wind', tour_id: 'fishing', tour_package_id: 'pkg-1', tour_date: '2026-12-01', time_slot_id: 'slot-1', guests: 4, booking_status: 'pending_confirmation', payment_status: 'pending', total_snapshot: 650, currency: 'USD', base_price_snapshot: 650, extra_guests_snapshot: 0, extra_guests_total_snapshot: 0, extras_total_snapshot: 0, departure_location_id: 'loc-1', departure_location_name_snapshot: 'Playas del Coco', departure_surcharge_snapshot: 0, departure_currency_snapshot: 'USD' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('https://wa.me/**', (route) => route.abort());

  return { browser, page, createBookingRequests };
}

async function runBookingFlowToPaymentStep(page) {
  // The homepage's own #booking teaser navigates to /reservar on "Start
  // booking" (a real page change, not a same-page reveal) — go there
  // directly instead of round-tripping through the homepage.
  await page.goto(`${base}/reservar`);
  const acceptDialog = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
  if (await acceptDialog.isVisible().catch(() => false)) await acceptDialog.click();
  const booking = page.locator('main');
  await booking.getByRole('button', { name: /Continue/i }).first().click();
  await booking.getByRole('button', { name: /Fishing/i }).first().click();
  await page.getByLabel(/Date/i).fill('2026-12-01');
  await chooseTimeSlot(page, 'Morning');
  await booking.getByRole('button', { name: /Continue/i }).last().click();
  await chooseDepartureLocation(page, 'Playas del Coco');
  await booking.getByRole('button', { name: /Continuar|Continue/i }).last().click();
  await page.getByPlaceholder('John Smith').fill('Key Test');
  await page.getByPlaceholder('john@email.com').fill('key-test@example.com');
  await page.getByPlaceholder('+506 0000 0000').fill('50600000000');
}

test('a payment method row with a distinct key from its default persists its OWN key, not the default', async () => {
  const paymentMethods = [{ id: '1', key: 'paypal-secondary', name: 'PayPal (secondary)', description: '', type: 'paypal', active: true, instructions: null, logo_url: null, sort_order: 1, created_at: '', updated_at: '' }];
  const f = await fixture(paymentMethods);
  const { page, createBookingRequests } = f;
  try {
    await runBookingFlowToPaymentStep(page);
    await page.locator('[data-payment-method="paypal-secondary"]').click();
    await expect.poll(() => createBookingRequests.length).toBeGreaterThan(0);
    assert.equal(createBookingRequests[0].paymentMethodKey, 'paypal-secondary');
    assert.notEqual(createBookingRequests[0].paymentMethodKey, 'paypal');
  } finally {
    await f.browser.close();
  }
});

test('the default paypal key still works unchanged for the seeded method', async () => {
  const paymentMethods = [{ id: '1', key: 'paypal', name: 'PayPal', description: '', type: 'paypal', active: true, instructions: null, logo_url: null, sort_order: 1, created_at: '', updated_at: '' }];
  const f = await fixture(paymentMethods);
  const { page, createBookingRequests } = f;
  try {
    await runBookingFlowToPaymentStep(page);
    await page.locator('[data-payment-method="paypal"]').click();
    await expect.poll(() => createBookingRequests.length).toBeGreaterThan(0);
    assert.equal(createBookingRequests[0].paymentMethodKey, 'paypal');
  } finally {
    await f.browser.close();
  }
});

test('an inactive payment method never renders as a selectable card', async () => {
  const paymentMethods = [
    { id: '1', key: 'paypal', name: 'PayPal', description: '', type: 'paypal', active: true, instructions: null, logo_url: null, sort_order: 1, created_at: '', updated_at: '' },
    { id: '2', key: 'pay-on-day', name: 'Pay on the Day', description: '', type: 'pay_on_day', active: false, instructions: null, logo_url: null, sort_order: 2, created_at: '', updated_at: '' },
  ];
  const f = await fixture(paymentMethods);
  const { page } = f;
  try {
    await runBookingFlowToPaymentStep(page);
    await expect(page.locator('[data-payment-method="paypal"]')).toBeVisible();
    await expect(page.locator('[data-payment-method="pay-on-day"]')).toHaveCount(0);
  } finally {
    await f.browser.close();
  }
});

test('a payment method with an unsupported type never renders a dead-end card', async () => {
  const paymentMethods = [
    { id: '1', key: 'paypal', name: 'PayPal', description: '', type: 'paypal', active: true, instructions: null, logo_url: null, sort_order: 1, created_at: '', updated_at: '' },
    { id: '2', key: 'sinpe-manual', name: 'SINPE Movil', description: '', type: 'sinpe', active: true, instructions: null, logo_url: null, sort_order: 2, created_at: '', updated_at: '' },
  ];
  const f = await fixture(paymentMethods);
  const { page } = f;
  try {
    await runBookingFlowToPaymentStep(page);
    await expect(page.locator('[data-payment-method="paypal"]')).toBeVisible();
    await expect(page.locator('[data-payment-method="sinpe-manual"]')).toHaveCount(0);
  } finally {
    await f.browser.close();
  }
});
