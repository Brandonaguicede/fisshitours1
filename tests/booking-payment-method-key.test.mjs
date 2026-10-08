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

async function fixture(paymentMethods, options = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });
  const createBookingRequests = [];
  const availabilityRequests = [];
  const priceRequests = [];

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
    if (path.endsWith('/boats')) {
      if (options.catalogGate) await options.catalogGate;
      return route.fulfill({ json: [boatRow] });
    }
    if (path.endsWith('/tour_packages')) {
      if (options.catalogGate) await options.catalogGate;
      return route.fulfill({ json: options.emptyCatalog ? [] : [tourPackageRow] });
    }
    if (path.endsWith('/time_slots')) return route.fulfill({ json: options.slotRows ?? [timeSlotRow] });
    if (path.endsWith('/tour_images') || path.endsWith('/tour_inclusions')) return route.fulfill({ json: [] });
    if (path.endsWith('/departure_locations')) {
      return route.fulfill({ json: [{ id: 'loc-1', name: 'Playas del Coco', slug: 'playas-del-coco', description: '', surcharge_amount: 0, currency: 'USD', active: true, sort_order: 1, is_default: true }] });
    }
    // getActivePaymentMethods() queries `.eq('active', true)` server-side —
    // replicate that filtering here rather than relying on the frontend to
    // do it (it doesn't; only `active` gates availability, per the fix).
    if (path.endsWith('/payment_methods')) return route.fulfill({ json: paymentMethods.filter((method) => method.active) });
    if (path.endsWith('/functions/v1/get-booking-availability')) {
      availabilityRequests.push(request.postDataJSON());
      return route.fulfill({ json: { slots: options.availabilitySlots ?? [{ id: 'slot-1', label: 'Morning', time: '07:00', available: true }] } });
    }
    if (path.endsWith('/functions/v1/calculate-booking-price')) {
      priceRequests.push(request.postDataJSON());
      return route.fulfill({ json: { custom_quote: false, base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, extra_guests: 0, extra_guests_total: 0, extras: [], extras_total: 0, subtotal: 650, tax_rate: 0.13, tax_amount: 84.50, total: 734.50, currency: 'USD' } });
    }
    if (path.endsWith('/functions/v1/create-booking')) {
      createBookingRequests.push(request.postDataJSON());
      return route.fulfill({ json: { booking_id: 'booking-1', booking_reference: 'PFT-TEST01', boat_id: 'second-wind', tour_id: 'fishing', tour_package_id: 'pkg-1', tour_date: '2026-12-01', time_slot_id: 'slot-1', guests: 4, booking_status: 'pending_confirmation', payment_status: 'pending', subtotal_snapshot: 650, tax_rate_snapshot: 0.13, tax_amount_snapshot: 84.50, total_snapshot: 734.50, currency: 'USD', base_price_snapshot: 650, extra_guests_snapshot: 0, extra_guests_total_snapshot: 0, extras_total_snapshot: 0, departure_location_id: 'loc-1', departure_location_name_snapshot: 'Playas del Coco', departure_surcharge_snapshot: 0, departure_currency_snapshot: 'USD', ...options.savedAmounts } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('https://wa.me/**', (route) => route.abort());

  return { browser, page, createBookingRequests, availabilityRequests, priceRequests };
}

// `acceptTerms` ticks the mandatory Terms and Conditions box (the payment methods stay locked until it is ticked).
async function runBookingFlowToPaymentStep(page, { acceptTerms = true } = {}) {
  // The homepage's own #booking teaser navigates to /reservar on "Start
  // booking" (a real page change, not a same-page reveal) — go there
  // directly instead of round-tripping through the homepage.
  await page.goto(`${base}/reservar`);
  const acceptDialog = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
  // Wait (briefly) for the cookie notice instead of sampling once: on a cold dev server it can mount after the first check and then covers the buttons.
  await acceptDialog.waitFor({ state: 'visible', timeout: 4000 }).then(() => acceptDialog.click()).catch(() => undefined);
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
  if (acceptTerms) await page.locator('label[for="booking-terms"]').click(); // click the visible selector, like a customer (the native input is visually hidden)
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
    { id: '2', key: 'cash', name: 'Cash', description: '', type: 'cash', active: false, instructions: null, logo_url: null, sort_order: 2, created_at: '', updated_at: '' },
  ];
  const f = await fixture(paymentMethods);
  const { page } = f;
  try {
    await runBookingFlowToPaymentStep(page);
    await expect(page.locator('[data-payment-method="paypal"]')).toBeVisible();
    await expect(page.locator('[data-payment-method="cash"]')).toHaveCount(0);
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

test('delayed remote catalog never sends static IDs; guest changes and create-booking use remote selection', async () => {
  let release;
  const catalogGate = new Promise(resolve => { release = resolve; });
  const f = await fixture([{ key: 'paypal', name: 'PayPal', type: 'paypal', active: true }], { catalogGate });
  try {
    await f.page.goto(`${base}/reservar`);
    await expect(f.page.getByText('Loading booking options...')).toBeVisible();
    assert.equal(f.priceRequests.length, 0);
    assert.equal(f.availabilityRequests.length, 0);
    release();
    await expect(f.page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
    assert.equal(f.priceRequests.length, 0);
    assert.equal(f.availabilityRequests.length, 0);
    await runBookingFlowToPaymentStep(f.page);
    await f.page.locator('[data-payment-method="paypal"]').click();
    await expect.poll(() => f.createBookingRequests.length).toBe(1);
    for (const input of [...f.priceRequests, ...f.availabilityRequests, ...f.createBookingRequests]) {
      assert.equal(input.boatId, 'boat-1');
      assert.equal(input.tourId, 'tour-1');
      assert.equal(input.tourPackageId, 'pkg-1');
    }
    assert.equal(f.priceRequests.at(-1).boatTourId, 'link-1');
    assert.equal(f.createBookingRequests[0].departureLocationId, 'loc-1');
  } finally { release(); await f.browser.close(); }
});

test('empty remote catalog never falls back to static booking packages', async () => {
  const f = await fixture([], { emptyCatalog: true });
  try {
    await f.page.goto(`${base}/reservar`);
    await f.page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(f.page.locator('input[name="tourPackage"]')).toHaveCount(0);
    assert.deepEqual(f.priceRequests, []);
    assert.deepEqual(f.availabilityRequests, []);
  } finally { await f.browser.close(); }
});

 test('booking summary and checkout display backend IVA and total with two decimals', async () => {
  const f = await fixture([{ id: 'method-paypal', key: 'paypal', name: 'PayPal', type: 'paypal', description: '', active: true, sort_order: 1 }]);
  try {
    await runBookingFlowToPaymentStep(f.page);
    await expect(f.page.getByRole('complementary').getByText('IVA (13%)', { exact: true }).first()).toBeVisible();
    await expect(f.page.getByRole('complementary').getByText('$84.50', { exact: true }).first()).toBeVisible();
    await expect(f.page.getByRole('complementary').getByText('$734.50', { exact: true }).first()).toBeVisible();
    await expect(f.page.getByRole('complementary').getByText('$650.00', { exact: true }).first()).toBeVisible();
  } finally { await f.browser.close(); }
 });

 test('checkout uses saved snapshots when the package price changed after the quote', async () => {
  const f=await fixture([{id:'1',key:'paypal',name:'PayPal',description:'',type:'paypal',active:true,sort_order:1}], {
    savedAmounts: {base_price_snapshot:850, subtotal_snapshot:850, tax_rate_snapshot:0.13, tax_amount_snapshot:110.50, total_snapshot:960.50}
  });
  try {
    await runBookingFlowToPaymentStep(f.page);
    await f.page.locator('[data-payment-method="paypal"]').click();
    await expect.poll(()=>f.createBookingRequests.length).toBeGreaterThan(0);
    const summary=f.page.getByRole('complementary');
    await expect(summary.getByText('$850.00',{exact:true})).toBeVisible();
    await expect(summary.getByText('$110.50',{exact:true})).toBeVisible();
    await expect(summary.getByText('$960.50',{exact:true})).toBeVisible();
  } finally { await f.browser.close(); }
 });

for (const viewport of [{width:1366,height:1200},{width:390,height:844}]) {
 test('WhatsApp payment link includes IVA and offers a retry without another booking '+viewport.width, async () => {
  const f=await fixture([{id:'wa',key:'whatsapp-link',name:'WhatsApp',description:'',type:'whatsapp_link',active:true,sort_order:1}]);
  try {
   await f.page.setViewportSize(viewport);
   await f.page.route('https://wa.me/**', route=>route.fulfill({status:204}));
   const requests=[];f.page.on('request',r=>{if(r.url().startsWith('https://wa.me/'))requests.push(r.url());});
   await runBookingFlowToPaymentStep(f.page);
   await f.page.locator('[data-payment-method="whatsapp-link"]').click();
   await expect.poll(()=>requests.length).toBe(1);
   const link=f.page.getByRole('link',{name:'Open WhatsApp',exact:true});
   await expect(link).toBeVisible();
   const url=new URL(await link.getAttribute('href'));
   assert.match(url.pathname,/^\/\d+$/);
   const message=url.searchParams.get('text');
   assert.match(message,/PFT-TEST01/);assert.match(message,/IVA \(13%\): \$84.50/);assert.match(message,/\$734.50/);
   await link.click();await expect.poll(()=>requests.length).toBe(2);
   assert.equal(f.createBookingRequests.length,1);
  } finally {await f.browser.close();}
 });
}


// --- Terms and Conditions at the last step ----------------------------------------------------------------------------
// Choosing a payment method is what creates the booking, so the methods stay aria-disabled (NOT `disabled`, which would swallow the click and
// the feedback) until the customer accepts the terms.
const paypalMethod = [{ id: '1', key: 'paypal', name: 'PayPal', description: '', type: 'paypal', active: true, instructions: null, logo_url: null, sort_order: 1, created_at: '', updated_at: '' }];

test('terms: payment methods are logically locked until accepted — aria-disabled + dimmed, an inline message (no browser alert) and NO booking is created', async () => {
  const f = await fixture(paypalMethod);
  try {
    const dialogs = []; f.page.on('dialog', (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await runBookingFlowToPaymentStep(f.page, { acceptTerms: false });
    const checkbox = f.page.locator('#booking-terms');
    const method = f.page.locator('[data-payment-method="paypal"]');
    await expect(checkbox).not.toBeChecked();
    await expect(f.page.getByLabel('I have read and accept the Terms and Conditions')).toBeVisible();
    await expect(f.page.locator('[data-terms-consent]').getByRole('button', { name: 'View Terms and Conditions' })).toBeVisible();
    await expect(method).toHaveAttribute('aria-disabled', 'true');
    await expect(method).not.toHaveAttribute('disabled'); // not a real `disabled`: it must still answer the click (Playwright reads aria-disabled as disabled, hence force below)
    await expect(method).toHaveClass(/opacity-60/);
    await expect(f.page.locator('#booking-terms-error')).toHaveCount(0);
    await method.click({ force: true });
    const error = f.page.locator('#booking-terms-error');
    await expect(error).toHaveText('Please accept the Terms and Conditions to continue.');
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    await expect(checkbox).toHaveAttribute('aria-describedby', 'booking-terms-error');
    await f.page.waitForTimeout(400);
    assert.equal(f.createBookingRequests.length, 0, 'no booking without accepting the terms');
    assert.deepEqual(dialogs, [], 'no browser alert()');
    await f.page.locator('label[for="booking-terms"]').click();
    await expect(error).toHaveCount(0);
    await expect(method).not.toHaveAttribute('aria-disabled', 'true');
    await expect(method).not.toHaveClass(/opacity-60/);
    await method.click();
    await expect.poll(() => f.createBookingRequests.length).toBe(1);
    const body = f.createBookingRequests[0];
    assert.equal(body.termsAccepted, true);
    assert.equal(body.termsVersion, 'v1');
    assert.equal(body.language, 'en');
    assert.ok(!('termsAcceptedAt' in body) && !('termsAcceptedVia' in body), 'the client sends no timestamp and no source');
  } finally { await f.browser.close(); }
});

test('terms: un-ticking the box locks the methods again and the request is blocked even if the customer retries', async () => {
  const f = await fixture(paypalMethod);
  try {
    await runBookingFlowToPaymentStep(f.page);
    const checkbox = f.page.locator('#booking-terms');
    await expect(checkbox).toBeChecked();
    await f.page.locator('label[for="booking-terms"]').click();
    const method = f.page.locator('[data-payment-method="paypal"]');
    await expect(method).toHaveAttribute('aria-disabled', 'true');
    await method.click({ force: true });
    await expect(f.page.locator('#booking-terms-error')).toBeVisible();
    await f.page.waitForTimeout(400);
    assert.equal(f.createBookingRequests.length, 0);
  } finally { await f.browser.close(); }
});

test('terms: the modal shows the structured v1 policies (EN), closes with X / Escape / Close and returns focus; the booking keeps all its state', async () => {
  const f = await fixture(paypalMethod);
  try {
    await runBookingFlowToPaymentStep(f.page, { acceptTerms: false });
    const open = f.page.locator('[data-terms-consent]').getByRole('button', { name: 'View Terms and Conditions' });
    await open.click();
    const dialog = f.page.getByRole('dialog', { name: 'Terms and Conditions' });
    await expect(dialog).toBeVisible();
    for (const heading of ['Reservations and Payments', 'Change and Cancellation Policies', 'Weather-related Cancellation Policies', 'Arrival and Punctuality', 'Customer Responsibilities', 'Privacy and Use of Personal Data']) {
      await expect(dialog.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(dialog.getByText('Bank transfer/PayPal fees will be covered by the client.')).toBeVisible();
    for (const removed of ['50% deposit', 'remaining balance', 'Payment methods:', 'safe and easy way to pay online']) await expect(dialog.getByText(removed)).toHaveCount(0);
    await expect(dialog.getByText('Cancellations within 3 days of the tour date: A 30% penalty will apply due to operational losses/boat rental costs.')).toBeVisible();
    await expect(dialog.getByText('Cancellations with full penalty: If you cancel within 24 hours of the tour, a 100% penalty will apply due to operational/boat rental costs, food, and beverage services.')).toBeVisible();
    // The version is internal: never shown in the header or anywhere in the dialog.
    await expect(dialog.getByText(/Version|Versión/)).toHaveCount(0);
    await expect(dialog).not.toContainText(/\bv1\b/);
    await expect(dialog.getByRole('heading', { name: 'Terms and Conditions' })).toBeVisible();
    await expect(dialog.getByText('Papagayo Fishing Tours', { exact: true })).toBeVisible();
    // Closing paths. Escape: the first stop of the keyboard path.
    await f.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    await open.click();
    await dialog.getByRole('button', { name: 'Close Terms and Conditions' }).click();
    await expect(dialog).toHaveCount(0);
    await open.click();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    // Nothing was lost: customer fields, tour step data and the (still unchecked) box.
    await expect(f.page.getByPlaceholder('John Smith')).toHaveValue('Key Test');
    await expect(f.page.getByPlaceholder('john@email.com')).toHaveValue('key-test@example.com');
    await expect(f.page.getByPlaceholder('+506 0000 0000')).toHaveValue('50600000000');
    await expect(f.page.locator('#booking-terms')).not.toBeChecked();
    await f.page.locator('label[for="booking-terms"]').click();
    await open.click();
    await f.page.keyboard.press('Escape');
    await expect(f.page.locator('#booking-terms')).toBeChecked();
    assert.equal(f.createBookingRequests.length, 0, 'opening the terms never creates a booking');
  } finally { await f.browser.close(); }
});

test('terms: ES — checkbox and modal in Spanish; switching the language with the modal flow keeps the booking state', async () => {
  const f = await fixture(paypalMethod);
  try {
    await runBookingFlowToPaymentStep(f.page, { acceptTerms: false });
    await f.page.getByRole('button', { name: 'Switch to Spanish' }).click();
    await expect(f.page.getByLabel('He leído y acepto los Términos y Condiciones')).toBeVisible();
    const open = f.page.locator('[data-terms-consent]').getByRole('button', { name: 'Ver Términos y Condiciones' });
    await expect(open).toBeVisible();
    await f.page.locator('[data-payment-method="paypal"]').click({ force: true });
    await expect(f.page.locator('#booking-terms-error')).toHaveText('Acepta los Términos y Condiciones para continuar.');
    await open.click();
    const dialog = f.page.getByRole('dialog', { name: 'Términos y Condiciones' });
    await expect(dialog).toBeVisible();
    for (const heading of ['Reservas y pagos', 'Políticas de cambios y cancelaciones', 'Políticas de cancelación por clima', 'Llegada y puntualidad', 'Responsabilidad del cliente', 'Privacidad y uso de datos personales']) {
      await expect(dialog.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(dialog.getByText('Las comisiones de transferencia bancaria o PayPal serán cubiertas por el cliente.')).toBeVisible();
    for (const removed of ['depósito del 50%', 'saldo restante', 'Métodos de pago:', 'forma segura y sencilla']) await expect(dialog.getByText(removed)).toHaveCount(0);
    await expect(dialog.getByText('Cancelaciones dentro de los 3 días de la fecha del tour: se aplicará una penalización del 30% debido a pérdidas operativas y costos de alquiler de embarcación.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(f.page.getByPlaceholder('John Smith')).toHaveValue('Key Test');
    await f.page.locator('label[for="booking-terms"]').click();
    await f.page.locator('[data-payment-method="paypal"]').click();
    await expect.poll(() => f.createBookingRequests.length).toBe(1);
    assert.equal(f.createBookingRequests[0].language, 'es');
    assert.equal(f.createBookingRequests[0].termsVersion, 'v1');
  } finally { await f.browser.close(); }
});

for (const [name, viewport] of [['desktop', { width: 1366, height: 800 }], ['phone', { width: 390, height: 720 }]]) {
  test(`terms modal (${name}): internal scroll, header + close always reachable, no horizontal overflow, keyboard focus stays inside, accessible dialog`, async () => {
    const f = await fixture(paypalMethod);
    try {
      await f.page.setViewportSize(viewport);
      await runBookingFlowToPaymentStep(f.page, { acceptTerms: false });
      await f.page.locator('[data-terms-consent]').getByRole('button', { name: 'View Terms and Conditions' }).click();
      const dialog = f.page.getByRole('dialog', { name: 'Terms and Conditions' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await f.page.waitForTimeout(700); // let the entrance animation (scale 0.95 -> 1) finish before measuring
      const metrics = await f.page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]');
        const body = document.querySelector('[data-terms-body]');
        const header = panel.querySelector('header');
        const rect = panel.getBoundingClientRect();
        return { panelWidth: rect.width, panelHeight: rect.height, panelBottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
          bodyScrolls: body.scrollHeight > body.clientHeight, bodyOverflowY: getComputedStyle(body).overflowY, panelScrollWidth: panel.scrollWidth, panelClientWidth: panel.clientWidth,
          docOverflow: document.documentElement.scrollWidth > window.innerWidth, headerTop: header.getBoundingClientRect().top, closeSize: panel.querySelector('button[aria-label="Close Terms and Conditions"]').getBoundingClientRect().width };
      });
      assert.ok(metrics.bodyScrolls, 'the policies scroll inside the dialog');
      // Thin, discreet scrollbar (class thin-scroll): standard properties for Chromium/Firefox, content still scrollable, no arrows / wide track.
      const scroll = await f.page.evaluate(() => { const body = document.querySelector('[data-terms-body]'); const style = getComputedStyle(body); body.scrollTop = 40; return { scrolled: body.scrollTop > 0, width: style.scrollbarWidth, color: style.scrollbarColor, overflowY: style.overflowY, gutter: body.offsetWidth - body.clientWidth }; });
      assert.ok(scroll.scrolled, 'the content still scrolls');
      assert.equal(scroll.overflowY, 'auto', 'overflow is not hidden');
      assert.equal(scroll.width, 'thin');
      assert.match(scroll.color, /rgba\(168, 211, 228, 0\.28\)\s+rgba\(0, 0, 0, 0\)|transparent/, 'low-contrast thumb on a transparent track');
      assert.ok(scroll.gutter <= 10, `no wide scrollbar gutter (got ${scroll.gutter}px)`);
      if (process.env.TERMS_SHOT_DIR) await f.page.screenshot({ path: `${process.env.TERMS_SHOT_DIR}/modal-${name}.png` });
      assert.equal(metrics.bodyOverflowY, 'auto');
      assert.ok(metrics.panelBottom <= metrics.viewportHeight + 1 && metrics.headerTop >= 0, 'the dialog fits the viewport: header and close are on screen');
      assert.ok(metrics.panelScrollWidth <= metrics.panelClientWidth + 1 && !metrics.docOverflow, 'no horizontal overflow');
      assert.ok(metrics.closeSize >= 44, `close target >= 44px (got ${metrics.closeSize})`);
      if (name === 'phone') assert.ok(metrics.panelWidth >= metrics.viewportWidth - 24 && metrics.panelHeight >= metrics.viewportHeight * 0.85, 'near full-screen on phones');
      else assert.ok(metrics.panelWidth <= 700 && metrics.panelWidth < metrics.viewportWidth, 'centered, reasonable width on desktop');
      // Keyboard: Tab never leaves the dialog; the last paragraph is reachable by scrolling the body.
      for (let index = 0; index < 4; index += 1) await f.page.keyboard.press('Tab');
      assert.ok(await f.page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), 'focus is trapped in the dialog');
      await dialog.locator('[data-terms-body]').evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(dialog.getByText('Papagayo Fishing Tours may modify or interrupt an activity')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    } finally { await f.browser.close(); }
  });
}

test('terms: the booking page has NO paraphrased rules of its own — only a link that opens the real v1 (EN, then ES)', async () => {
  const f = await fixture(paypalMethod);
  try {
    await f.page.goto(`${base}/reservar`);
    const info = f.page.getByText('Booking information');
    await expect(info).toBeVisible();
    const link = f.page.locator('[data-terms-link]');
    await expect(link).toHaveText('View Terms and Conditions');
    // The old 3-line summary is gone: none of its wording (or any policy wording) is printed outside the modal.
    const mainText = await f.page.locator('body').innerText();
    for (const legacy of ['30% penalty', '100% refund', 'without penalty', 'subject to availability confirmation', 'Payment methods:', 'penalidad', 'reembolso del 100%']) assert.ok(!mainText.includes(legacy), `legacy text "${legacy}" must not be on the page`);
    await link.click();
    const dialog = f.page.getByRole('dialog', { name: 'Terms and Conditions' });
    await expect(dialog.getByText('Cancellations 3 days before the tour date: You may cancel your tour without penalty up to 3 days before the tour and receive a 100% refund.')).toBeVisible();
    await expect(dialog.getByText('Bank transfer/PayPal fees will be covered by the client.')).toBeVisible();
    await f.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(link).toBeFocused();
    await f.page.getByRole('button', { name: 'Switch to Spanish' }).click();
    await expect(f.page.locator('[data-terms-link]')).toHaveText('Ver Términos y Condiciones');
    await f.page.locator('[data-terms-link]').click();
    const es = f.page.getByRole('dialog', { name: 'Términos y Condiciones' });
    await expect(es.getByText('Cancelaciones 3 días antes de la fecha del tour: el cliente puede cancelar sin penalización hasta 3 días antes del tour y recibir un reembolso del 100%.')).toBeVisible();
    await expect(es.getByText('Las comisiones de transferencia bancaria o PayPal serán cubiertas por el cliente.')).toBeVisible();
  } finally { await f.browser.close(); }
});

for (const [name, viewport] of [['desktop', { width: 1366, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
  test(`terms: the acceptance is a styled selector like the packages / times (no native checkbox look), aligned, accessible and without overflow (${name})`, async () => {
    const f = await fixture(paypalMethod);
    try {
      await f.page.setViewportSize(viewport);
      await runBookingFlowToPaymentStep(f.page, { acceptTerms: false });
      const consent = f.page.locator('[data-terms-consent]');
      const card = consent.locator('label');
      const input = consent.locator('#booking-terms');
      const indicator = consent.locator('[data-terms-check]');
      await consent.scrollIntoViewIfNeeded();
      // The native control is never drawn: 1px, clipped (sr-only) — the round check is what the customer sees.
      const nativeBox = await input.boundingBox();
      assert.ok(nativeBox.width <= 2 && nativeBox.height <= 2, 'native checkbox is visually hidden');
      await expect(indicator).toBeVisible();
      assert.equal(await indicator.evaluate((node) => getComputedStyle(node).borderRadius), '9999px', 'round, like the other selectors');
      await expect(card).not.toHaveAttribute('data-selected', 'true');
      // Selecting it fills the check and selects the card — the same state the packages / times use.
      await card.click();
      await expect(input).toBeChecked();
      await expect(card).toHaveAttribute('data-selected', 'true');
      await expect(indicator.locator('svg')).toBeVisible();
      await f.page.waitForTimeout(400); // the fill is a colour transition
      assert.notEqual(await indicator.evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'filled when selected');
      await card.click();
      await expect(input).not.toBeChecked();
      // Keyboard: Space on the (visually hidden) input toggles it.
      await input.focus();
      await f.page.keyboard.press('Space');
      await expect(input).toBeChecked();
      await f.page.keyboard.press('Space');
      await expect(input).not.toBeChecked();
      // The accessible name is exactly the acceptance sentence; the link is a separate control.
      await expect(f.page.getByRole('checkbox', { name: 'I have read and accept the Terms and Conditions' })).toBeAttached();
      // Layout: the "View Terms" link lines up with the text (not under the check), nothing overflows or overlaps.
      const geometry = await f.page.evaluate(() => {
        const root = document.querySelector('[data-terms-consent]');
        const label = root.querySelector('label'); const text = label.querySelector('span:last-child'); const link = root.querySelector('button');
        const r = (el) => el.getBoundingClientRect();
        return { cardRight: r(label).right, cardBottom: r(label).bottom, textLeft: r(text).left, linkLeft: r(link).left, linkTop: r(link).top, linkHeight: r(link).height, viewport: window.innerWidth, docOverflow: document.documentElement.scrollWidth > window.innerWidth, rootScroll: root.scrollWidth - root.clientWidth };
      });
      assert.ok(Math.abs(geometry.linkLeft - geometry.textLeft) <= 2, `link aligned with the text (${geometry.linkLeft} vs ${geometry.textLeft})`);
      assert.ok(geometry.linkTop >= geometry.cardBottom - 1, 'link sits below the card');
      assert.ok(geometry.cardRight <= geometry.viewport && !geometry.docOverflow && geometry.rootScroll <= 0, 'no horizontal overflow');
      if (name === 'phone') assert.ok(geometry.linkHeight >= 44, 'touch target >= 44px');
      // The control sits right above the payment methods, inside the same step.
      const gap = await f.page.evaluate(() => document.querySelector('[data-payment-method]').getBoundingClientRect().top - document.querySelector('[data-terms-consent]').getBoundingClientRect().bottom);
      assert.ok(gap >= 0 && gap < 120, `terms control directly above the payment methods (gap ${gap}px)`);
      if (process.env.TERMS_SHOT_DIR) {
        await card.click();
        await f.page.locator('[data-terms-consent]').locator('xpath=ancestor::div[contains(@class,"flex-col")][1]').screenshot({ path: `${process.env.TERMS_SHOT_DIR}/terms-${name}-checked.png` }).catch(() => undefined);
        await card.click();
        await f.page.locator('[data-payment-method]').first().click({ force: true });
        await f.page.locator('[data-terms-consent]').locator('xpath=ancestor::div[contains(@class,"flex-col")][1]').screenshot({ path: `${process.env.TERMS_SHOT_DIR}/terms-${name}-error.png` }).catch(() => undefined);
      }
    } finally { await f.browser.close(); }
  });
}

// --- Pay on the Day is gone; departure hours are chronological in the public booking ------------------------------------------------------------

test('pay on the day: not offered anywhere in the public booking — not even if an old payment_methods row still existed', async () => {
  const legacy = { id: '9', key: 'pay-on-day', name: 'Pay on the Day of the Tour', description: 'Pay when the tour starts.', type: 'pay_on_day', active: true, instructions: null, logo_url: null, sort_order: 3, created_at: '', updated_at: '' };
  const f = await fixture([...paypalMethod, legacy]);
  try {
    await runBookingFlowToPaymentStep(f.page, { acceptTerms: false });
    await expect(f.page.locator('[data-payment-method="paypal"]')).toBeVisible();
    await expect(f.page.locator('[data-payment-method="pay-on-day"]')).toHaveCount(0);
    const body = await f.page.locator('body').innerText();
    for (const gone of [/Pay on the Day/i, /Pagar el d[ií]a del tour/i, /Pay when the tour starts/i, /Paga cuando inicie/i]) assert.doesNotMatch(body, gone);
    await f.page.getByRole('button', { name: 'Switch to Spanish' }).click();
    assert.doesNotMatch(await f.page.locator('body').innerText(), /Pagar el d[ií]a del tour|Paga cuando inicie/i);
    // Only the real, supported methods are cards.
    assert.deepEqual(await f.page.locator('[data-payment-method]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-payment-method'))), ['paypal']);
  } finally { await f.browser.close(); }
});

test('hours: the public booking lists the departure times chronologically whatever order the availability answer arrives in', async () => {
  const hours = [['s5', '16:30'], ['s1', '08:00'], ['s4', '12:00'], ['s0', '06:00'], ['s3', '11:30'], ['s2', '14:00']];
  const f = await fixture(paypalMethod, { slotRows: hours.map(([id, time]) => ({ id, label: time, starts_at: `${time}:00`, is_general: true })), availabilitySlots: [
    { id: 's5', label: '16:30', time: '16:30', available: true }, { id: 's1', label: '08:00', time: '08:00', available: true }, { id: 's4', label: '12:00', time: '12:00', available: true },
    { id: 's0', label: '06:00', time: '06:00', available: true }, { id: 's3', label: '11:30', time: '11:30', available: true }, { id: 's2', label: '14:00', time: '14:00', available: true },
  ] });
  try {
    await f.page.goto(`${base}/reservar`);
    const booking = f.page.locator('main');
    await booking.getByRole('button', { name: /Continue/i }).first().click();
    await booking.getByRole('button', { name: /Fishing/i }).first().click();
    await f.page.getByLabel(/Date/i).fill('2026-12-01');
    const radios = f.page.locator('input[name="timeSlot"]');
    await expect(radios).toHaveCount(6);
    const labels = await f.page.locator('label:has(input[name="timeSlot"])').allInnerTexts();
    assert.deepEqual(labels.map((text) => text.split('\n')[0].trim()), ['6:00 AM', '8:00 AM', '11:30 AM', '12:00 PM', '2:00 PM', '4:30 PM']);
  } finally { await f.browser.close(); }
});
