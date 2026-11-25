// Booking attempts, in the browser: (1) the BookingPanel keeps the contact data on the last step, (2) the Admin "Intentos de reserva" section.
// Runs under `npm run test:admin` (vite --mode test): every Supabase call is intercepted on the fake admin-test.supabase.co project.
// Set LEADS_SCREENSHOT_DIR to also save screenshots.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const shotDir = process.env.LEADS_SCREENSHOT_DIR;
const shot = async (page, name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name), fullPage: true }); };
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

// ---- (1) BookingPanel -------------------------------------------------------------------------------------------------------------------

const boatRow = { id: 'boat-1', slug: 'second-wind', name: 'Second Wind', image_url: null, images: null, badge: null, length: '32ft', engine: 'Yamaha 250', max_guests: 10, featured_spec: null, active: true, sort_order: 1 };
const tourPackageRow = {
  id: 'pkg-1', active: true, name: 'Half Day', package_type: 'half-day', departure_times: null, meal_options: null,
  description: 'Half day fishing', package_included: null, duration_minutes: 240, sort_order: 1,
  base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, custom_quote: false,
  boat_tours: { id: 'link-1', boat_id: 'boat-1', tour_id: 'tour-1', active: true, boats: { active: true, max_guests: 10 },
    tours: { id: 'tour-1', title: 'Fishing Tour', category: 'Fishing', description: 'Half day fishing trip', image_url: null, included: null, highlights: null, active: true } },
};
const paymentMethod = { id: '1', key: 'paypal', name: 'PayPal', description: '', type: 'paypal', active: true, instructions: null, logo_url: null, sort_order: 1, created_at: '', updated_at: '' };

async function bookingFixture({ failLeadSave = false } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });
  const leadRequests = [];
  const createBookingRequests = [];
  const forbidden = [];
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const p = new URL(request.url()).pathname;
    if (p.endsWith('/boats')) return route.fulfill({ json: [boatRow] });
    if (p.endsWith('/tour_packages')) return route.fulfill({ json: [tourPackageRow] });
    if (p.endsWith('/time_slots')) return route.fulfill({ json: [{ id: 'slot-1', label: 'Morning', starts_at: '07:00:00' }] });
    if (p.endsWith('/tour_images') || p.endsWith('/tour_inclusions')) return route.fulfill({ json: [] });
    if (p.endsWith('/departure_locations')) return route.fulfill({ json: [{ id: 'loc-1', name: 'Playas del Coco', slug: 'playas-del-coco', description: '', surcharge_amount: 0, currency: 'USD', active: true, sort_order: 1, is_default: true }] });
    if (p.endsWith('/payment_methods')) return route.fulfill({ json: [paymentMethod] });
    if (p.endsWith('/functions/v1/get-booking-availability')) return route.fulfill({ json: { slots: [{ id: 'slot-1', label: 'Morning', time: '07:00', available: true }] } });
    if (p.endsWith('/functions/v1/calculate-booking-price')) return route.fulfill({ json: { custom_quote: false, base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, extra_guests: 0, extra_guests_total: 0, extras: [], extras_total: 0, subtotal: 650, tax_rate: 0.13, tax_amount: 84.5, total: 734.5, currency: 'USD' } });
    if (p.endsWith('/functions/v1/save-booking-lead')) {
      leadRequests.push({ at: Date.now(), body: request.postDataJSON() });
      return failLeadSave ? route.fulfill({ status: 500, json: { message: 'down' } }) : route.fulfill({ json: { saved: true } });
    }
    if (p.endsWith('/functions/v1/create-booking')) {
      createBookingRequests.push(request.postDataJSON());
      return route.fulfill({ json: { booking_id: 'booking-1', booking_reference: 'PFT-TEST01', boat_id: 'boat-1', tour_id: 'tour-1', tour_package_id: 'pkg-1', tour_date: '2026-12-01', time_slot_id: 'slot-1', guests: 4, booking_status: 'pending_payment', payment_status: 'pending', subtotal_snapshot: 650, tax_rate_snapshot: 0.13, tax_amount_snapshot: 84.5, total_snapshot: 734.5, currency: 'USD', base_price_snapshot: 650, extra_guests_snapshot: 0, extra_guests_total_snapshot: 0, extras_total_snapshot: 0, departure_location_id: 'loc-1', departure_location_name_snapshot: 'Playas del Coco', departure_surcharge_snapshot: 0, departure_currency_snapshot: 'USD' } });
    }
    // The attempt must never reach booking tables from the browser.
    if (/\/(bookings|customers|availability_blocks|payments)$/.test(p) && request.method() !== 'GET') forbidden.push(`${request.method()} ${p}`);
    return route.fulfill({ json: [] });
  });
  await page.route('https://wa.me/**', (route) => route.abort());
  return { browser, page, leadRequests, createBookingRequests, forbidden };
}

async function goToCustomerStep(page) {
  await page.goto(`${base}/reservar`);
  const acceptDialog = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
  await acceptDialog.waitFor({ state: 'visible', timeout: 4000 }).then(() => acceptDialog.click()).catch(() => undefined);
  const main = page.locator('main');
  await main.getByRole('button', { name: /Continue/i }).first().click();
  await main.getByRole('button', { name: /Fishing/i }).first().click();
  await page.getByLabel(/Date/i).fill('2026-12-01');
  await page.locator('main label').filter({ hasText: 'Morning' }).first().click();
  await main.getByRole('button', { name: /Continue/i }).last().click();
  await page.locator('main label').filter({ hasText: 'Playas del Coco' }).first().click();
  await main.getByRole('button', { name: /Continuar|Continue/i }).last().click();
}

test('booking leads UI: nothing is saved until name, email and WhatsApp are valid; then once, ~1.5 s after the last change', async () => {
  const f = await bookingFixture();
  const { page, leadRequests } = f;
  try {
    await goToCustomerStep(page);
    await expect(page.getByPlaceholder('John Smith')).toBeVisible();
    await page.waitForTimeout(1900);
    assert.equal(leadRequests.length, 0, 'visiting the step saves nothing');

    await page.getByPlaceholder('John Smith').fill('Ana Mora');
    await page.getByPlaceholder('john@email.com').fill('ana@example');
    await page.getByPlaceholder('8888 0000').fill('1234');
    await page.waitForTimeout(1900);
    assert.equal(leadRequests.length, 0, 'incomplete / invalid data is never sent');

    await page.getByPlaceholder('john@email.com').fill('ana@example.com');
    await page.getByPlaceholder('8888 0000').fill('8888 12');
    await page.waitForTimeout(300);
    await page.getByPlaceholder('8888 0000').fill('8888 1234');
    const typedAt = Date.now();
    await expect.poll(() => leadRequests.length, { timeout: 5000 }).toBe(1);
    assert.ok(leadRequests[0].at - typedAt >= 1000, 'debounced: it waits after the last keystroke');
    await page.waitForTimeout(1900);
    assert.equal(leadRequests.length, 1, 'rapid edits collapse into one request and an unchanged form sends nothing more');

    const { clientToken, customer, language, context } = leadRequests[0].body;
    assert.match(clientToken, /^[0-9a-f-]{36}$/);
    assert.deepEqual(customer, { fullName: 'Ana Mora', email: 'ana@example.com', whatsapp: '+50688881234' });
    assert.equal(language, 'en');
    // The customer went through step 1 and 2, so their selection is recorded.
    assert.deepEqual(context, { boatId: 'boat-1', tourId: 'tour-1', tourPackageId: 'pkg-1', tourDate: '2026-12-01', timeSlotId: 'slot-1', guests: 4 });
    await shot(page, 'booking-panel-step3-desktop.png');

    // Same session, a real change: the SAME token is sent again (an update, not a new lead).
    await page.getByPlaceholder('8888 0000').fill('8888 9999');
    await expect.poll(() => leadRequests.length, { timeout: 5000 }).toBe(2);
    assert.equal(leadRequests[1].body.clientToken, clientToken);
    assert.equal(leadRequests[1].body.customer.whatsapp, '+50688889999');
    assert.deepEqual(f.forbidden, [], 'no booking, customer, block or payment write from the browser');
    assert.equal(f.createBookingRequests.length, 0, 'saving the attempt never creates a booking');
  } finally { await f.browser.close(); }
});

test('booking leads UI: the booking carries the attempt token, and a failing save never blocks the checkout', async () => {
  const f = await bookingFixture({ failLeadSave: true });
  const { page, leadRequests, createBookingRequests } = f;
  try {
    await goToCustomerStep(page);
    await page.getByPlaceholder('John Smith').fill('Ana Mora');
    await page.getByPlaceholder('john@email.com').fill('ana@example.com');
    await page.getByPlaceholder('8888 0000').fill('8888 1234');
    await expect.poll(() => leadRequests.length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    await page.locator('label[for="booking-terms"]').click();
    await page.locator('[data-payment-method="paypal"]').click();
    await expect.poll(() => createBookingRequests.length).toBe(1);
    assert.equal(createBookingRequests[0].leadToken, leadRequests[0].body.clientToken, 'the same token ties the booking to its attempt');
    assert.equal(createBookingRequests[0].customer.email, 'ana@example.com');
    assert.equal(createBookingRequests[0].customer.whatsapp, '+50688881234', 'the booking also receives the normalized international number');
  } finally { await f.browser.close(); }
});

test('booking leads UI: the phone prefix is chosen by the customer; an invalid number is explained and never saved', async () => {
  const f = await bookingFixture();
  const { page, leadRequests } = f;
  try {
    await goToCustomerStep(page);
    const country = page.locator('#booking-phone-country');
    const phoneInput = page.getByPlaceholder('8888 0000');
    await expect(country).toHaveValue('CR');
    await expect(country.locator('option').first()).toHaveText('Costa Rica (+506)');
    await page.getByPlaceholder('John Smith').fill('Ana Mora');
    await page.getByPlaceholder('john@email.com').fill('ana@example.com');

    // 8 digits with Costa Rica: saved as +506. 10 digits with Costa Rica selected: rejected with a reason, never silently kept.
    await phoneInput.fill('8888 1234');
    await expect(page.locator('#booking-phone-hint')).toContainText('+50688881234');
    await expect.poll(() => leadRequests.length, { timeout: 5000 }).toBe(1);
    assert.equal(leadRequests[0].body.customer.whatsapp, '+50688881234');
    await phoneInput.fill('305 555 0100');
    await phoneInput.blur();
    await expect(page.locator('#booking-phone-hint')).toContainText('8 digits');
    await expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
    await page.waitForTimeout(1900);
    assert.equal(leadRequests.length, 1, 'an invalid number sends nothing');

    // The customer picks the United States: the same digits are now a valid +1 number and the lead carries exactly that.
    await country.selectOption('US');
    await expect(page.locator('#booking-phone-hint')).toContainText('+13055550100');
    await expect.poll(() => leadRequests.length, { timeout: 5000 }).toBe(2);
    assert.equal(leadRequests[1].body.customer.whatsapp, '+13055550100');
    assert.equal(leadRequests[1].body.clientToken, leadRequests[0].body.clientToken, 'same session, same attempt');

    // An explicit "+" typed by the customer wins over the selector; the 8 digits of a foreign number never become +506.
    await phoneInput.fill('+44 7911 123456');
    await expect.poll(() => leadRequests.length, { timeout: 5000 }).toBe(3);
    assert.equal(leadRequests[2].body.customer.whatsapp, '+447911123456');
    for (const request of leadRequests) assert.doesNotMatch(request.body.customer.whatsapp, /^\+506(305|7911)/);
    await shot(page, 'booking-panel-phone-prefix.png');
  } finally { await f.browser.close(); }
});

test('booking leads UI: mobile step 3 still renders and saves', async () => {
  const f = await bookingFixture();
  try {
    await f.page.setViewportSize({ width: 390, height: 844 });
    await goToCustomerStep(f.page);
    await f.page.getByPlaceholder('John Smith').fill('Ana Mora');
    await f.page.getByPlaceholder('john@email.com').fill('ana@example.com');
    await f.page.getByPlaceholder('8888 0000').fill('8888 1234');
    await expect.poll(() => f.leadRequests.length, { timeout: 5000 }).toBe(1);
    await shot(f.page, 'booking-panel-step3-mobile.png');
  } finally { await f.browser.close(); }
});

// ---- (2) Admin ---------------------------------------------------------------------------------------------------------------------------

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const leadRows = () => [
  { id: 'lead-1', status: 'open', full_name: 'Ana Mora', email: 'ana@example.com', whatsapp: '+50688881234', language: 'es', tour_date: null, guests: null, boat_name: 'Second Wind', tour_title: 'Fishing Tour', package_name: 'Half Day', time_slot_label: null, booking_id: null, converted_at: null, created_at: minutesAgo(20), updated_at: minutesAgo(10), bookings: null },
  { id: 'lead-2', status: 'open', full_name: 'Bob Stone', email: 'bob.stone@example.com', whatsapp: '+13055550100', language: 'en', tour_date: '2099-10-01', guests: 4, boat_name: 'Second Wind', tour_title: 'Sunset Cruise', package_name: 'Premium', time_slot_label: 'Afternoon', booking_id: null, converted_at: null, created_at: minutesAgo(300), updated_at: minutesAgo(180), bookings: null },
  { id: 'lead-3', status: 'converted', full_name: null, email: null, whatsapp: null, language: 'es', tour_date: '2099-11-01', guests: 2, boat_name: 'Second Wind', tour_title: 'Fishing Tour', package_name: 'Half Day', time_slot_label: 'Morning', booking_id: 'booking-9', converted_at: minutesAgo(30), created_at: minutesAgo(90), updated_at: minutesAgo(30), bookings: { booking_reference: 'PFT-CONV0001' } },
];

async function adminFixture(viewport = { width: 1440, height: 1000 }) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport });
  const leadCalls = [];
  const writes = [];
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const p = url.pathname;
    if (p.endsWith('/token')) return route.fulfill({ json: { access_token: 'test-admin-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
    if (p.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (p.endsWith('/user')) return route.fulfill({ json: user });
    if (p.endsWith('/booking_leads')) {
      leadCalls.push({ method: request.method(), search: url.search });
      if (request.method() !== 'GET') writes.push(`${request.method()} ${p}`);
      return route.fulfill({ json: leadRows() });
    }
    if (p.endsWith('/rpc/list_admin_bookings')) return route.fulfill({ json: { rows: [], total: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  await page.goto(`${base}/admin/reservations`);
  return { browser, page, leadCalls, writes };
}

test('admin booking attempts: lists open attempts with state, contact and links; converted ones are filtered apart', async () => {
  const f = await adminFixture();
  const { page } = f;
  try {
    await page.getByRole('button', { name: 'Intentos de reserva' }).click();
    const table = page.locator('.admin-reservations-table');
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(2);

    const inProgress = rows.filter({ hasText: 'Ana Mora' });
    await expect(inProgress).toContainText('ana@example.com');
    await expect(inProgress).toContainText('+50688881234');
    await expect(inProgress).toContainText('Fishing Tour');
    await expect(inProgress).toContainText('Half Day');
    await expect(inProgress.locator('.admin-badge')).toHaveText('En proceso');
    // Date / time / guests were not confirmed by the customer: shown as a dash, never as a selection.
    await expect(inProgress.locator('td').nth(3)).toHaveText('—');

    const abandoned = rows.filter({ hasText: 'Bob Stone' });
    await expect(abandoned.locator('.admin-badge')).toHaveText('Posiblemente abandonado');
    await expect(abandoned.locator('td').nth(3)).toContainText('Afternoon');
    await expect(abandoned.locator('td').nth(3)).toContainText('4 personas');

    // Links: mailto with the stored email, wa.me with the stored number (+ greeting in the customer's language).
    await expect(inProgress.getByRole('link', { name: /correo/i })).toHaveAttribute('href', 'mailto:ana@example.com');
    const whatsappHref = await inProgress.getByRole('link', { name: /WhatsApp/i }).getAttribute('href');
    const wa = new URL(whatsappHref);
    assert.equal(wa.origin + wa.pathname, 'https://wa.me/50688881234');
    assert.match(wa.searchParams.get('text'), /Ana/);
    assert.match(wa.searchParams.get('text'), /Fishing Tour/);
    assert.equal(await inProgress.getByRole('link', { name: /WhatsApp/i }).getAttribute('target'), '_blank');
    const bobWa = new URL(await abandoned.getByRole('link', { name: /WhatsApp/i }).getAttribute('href'));
    assert.equal(bobWa.pathname, '/13055550100');
    assert.match(bobWa.searchParams.get('text'), /^Hello Bob/);
    await shot(page, 'admin-leads-desktop.png');

    // Filters: only abandoned, then converted (no personal data, no contact actions).
    await page.getByLabel('Filtrar intentos de reserva').selectOption('abandoned');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Bob Stone');
    await page.getByLabel('Filtrar intentos de reserva').selectOption('converted');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('PFT-CONV0001');
    await expect(rows.first().locator('.admin-badge')).toHaveText('Convertido');
    await expect(rows.first()).not.toContainText('@');
    await expect(rows.first().getByRole('link')).toHaveCount(0);
    await shot(page, 'admin-leads-converted.png');

    // Read-only: the section only ever reads.
    assert.ok(f.leadCalls.length >= 1);
    assert.deepEqual(f.writes, []);
    // Back to the reservations list.
    await page.getByRole('button', { name: 'Reservas', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Crear reserva' })).toBeVisible();
  } finally { await f.browser.close(); }
});

test('admin booking attempts: mobile cards fit the screen and keep the contact actions', async () => {
  const f = await adminFixture({ width: 390, height: 844 });
  const { page } = f;
  try {
    await page.getByRole('button', { name: 'Intentos de reserva' }).click();
    const cards = page.locator('.admin-reservation-cards .admin-reservation-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.first().getByRole('link', { name: /correo/i })).toBeVisible();
    await expect(cards.first().getByRole('link', { name: /WhatsApp/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `no horizontal page scroll (overflow ${overflow}px)`);
    await shot(page, 'admin-leads-mobile.png');
  } finally { await f.browser.close(); }
});
