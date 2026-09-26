// Public booking with incomplete / inconsistent packages. A package the Admin let go live without a duration made the availability
// call fail (HTTP 400) and the customer only saw "We couldn't load the booking information". Now: an incomplete package is not
// offered at all; if one still reaches the form (legacy data, a race with an Admin change) the customer gets a friendly message in
// their language and can pick another option; real network / backend failures keep their own generic message.
// Same page.route mocking as the other public booking tests (no real Supabase, no payments).
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';

const FRIENDLY_EN = 'This option is temporarily unavailable. Please choose another package or contact us for assistance.';
const FRIENDLY_ES = 'Esta opción no está disponible temporalmente. Elige otro paquete o contáctanos para recibir ayuda.';
const GENERIC_EN = /We couldn.t load the booking information\. Please try again\./;
const GENERIC_ES = /No pudimos cargar la información de la reserva\. Inténtalo de nuevo\./;
// Internal wording that must never reach a customer (ordinary words such as "Duration" are fine).
const TECHNICAL = /duration_minutes|departure_times|supabase|database|package configuration|column|null|PACKAGE_UNAVAILABLE|not available for booking|edge function/i;

const boatRow = { id: 'boat-1', slug: 'second-wind', name: 'Second Wind', image_url: null, images: null, badge: null, length: '32ft', engine: 'Yamaha 250', max_guests: 10, featured_spec: null, active: true, sort_order: 1 };
const packageRow = (id, name, extra = {}) => ({
  id, active: true, name, package_type: 'half-day', departure_times: null, meal_options: null, description: `${name} fishing`, package_included: null, duration_minutes: 240, sort_order: 1,
  base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, custom_quote: false,
  boat_tours: {
    id: 'link-1', boat_id: 'boat-1', tour_id: 'tour-1', active: true, boats: { active: true, max_guests: 10 },
    tours: { id: 'tour-1', title: 'Fishing Tour', category: 'Fishing', description: 'Fishing trip', image_url: null, included: null, highlights: null, active: true },
  },
  ...extra,
});

async function fixture({ packages, availability, language = 'en' }) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });
  await page.addInitScript((value) => window.localStorage.setItem('language', value), language);
  const availabilityRequests = [];
  const warnings = [];
  page.on('console', (message) => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/boats')) return route.fulfill({ json: [boatRow] });
    if (path.endsWith('/tour_packages')) return route.fulfill({ json: packages });
    if (path.endsWith('/time_slots')) return route.fulfill({ json: [{ id: 'slot-1', label: 'Morning', starts_at: '07:00:00' }] });
    if (path.endsWith('/tour_images') || path.endsWith('/tour_inclusions')) return route.fulfill({ json: [] });
    if (path.endsWith('/departure_locations')) return route.fulfill({ json: [{ id: 'loc-1', name: 'Playas del Coco', slug: 'playas-del-coco', description: '', surcharge_amount: 0, currency: 'USD', active: true, sort_order: 1, is_default: true }] });
    if (path.endsWith('/payment_methods')) return route.fulfill({ json: [] });
    if (path.endsWith('/functions/v1/get-booking-availability')) {
      const body = request.postDataJSON();
      availabilityRequests.push(body);
      return availability(route, body);
    }
    if (path.endsWith('/functions/v1/calculate-booking-price')) return route.fulfill({ json: { custom_quote: false, base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, extra_guests: 0, extra_guests_total: 0, extras: [], extras_total: 0, total: 650, currency: 'USD' } });
    return route.fulfill({ json: [] });
  });
  return { browser, page, availabilityRequests, warnings };
}

const okSlots = (route) => route.fulfill({ json: { slots: [{ id: 'slot-1', label: 'Morning', time: '07:00', available: true }] } });
const packageMissing = (route) => route.fulfill({ status: 400, json: { message: 'Tour package is not available for booking' } });

async function openTour(page, language = 'en') {
  await page.goto(`${base}/reservar`);
  const accept = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  const booking = page.locator('main');
  await booking.getByRole('button', { name: /Continue|Continuar/i }).first().click();
  await booking.getByRole('button', { name: /Fishing|Pesca/i }).first().click();
  return booking;
}
const pickPackage = (page, name) => page.locator('main label').filter({ hasText: name }).first().click();
// Two <main> elements exist (layout + booking); the booking content is the last one.
const pageText = (page) => page.locator('main').last().innerText();

test('VALID: boat -> tour -> complete package -> date -> departure -> guests -> next step works', async () => {
  const f = await fixture({ packages: [packageRow('pkg-1', 'Half Day')], availability: okSlots }); const { page, availabilityRequests } = f;
  try {
    const booking = await openTour(page);
    await page.getByLabel(/Date/i).fill('2026-12-01');
    await page.locator('main label').filter({ hasText: 'Morning' }).first().click();
    await expect.poll(() => availabilityRequests.length).toBeGreaterThan(0);
    await expect(page.getByText(GENERIC_EN)).toHaveCount(0);
    await expect(page.getByText(FRIENDLY_EN)).toHaveCount(0);
    await booking.getByRole('button', { name: /Continue/i }).last().click();
    await expect(page.locator('main label').filter({ hasText: 'Playas del Coco' }).first()).toBeVisible(); // the next step (departure location)
  } finally { await f.browser.close(); }
});

test('INVALID (no duration): the package is not offered, the page keeps working, no technical error is shown', async () => {
  const f = await fixture({ packages: [packageRow('pkg-good', 'Half Day'), packageRow('pkg-bad', 'Full Day', { duration_minutes: null, base_price: 800 })], availability: okSlots }); const { page } = f;
  try {
    const booking = await openTour(page);
    // Only the complete package is left, so it is selected for the customer: no chooser, no "Full Day", no USD 800.
    await expect(booking.getByRole('button', { name: /From USD 650/ }).first()).toBeVisible();
    await expect(page.locator('main label').filter({ hasText: 'Full Day' })).toHaveCount(0);
    const text = await pageText(page);
    assert.match(text, /Fishing - Half Day/);
    assert.doesNotMatch(text, /Full Day|800/);
    assert.doesNotMatch(text, GENERIC_EN);
    assert.doesNotMatch(text, TECHNICAL);
    // The rest of the flow is untouched.
    await page.getByLabel(/Date/i).fill('2026-12-01');
    await page.locator('main label').filter({ hasText: 'Morning' }).first().click();
    await booking.getByRole('button', { name: /Continue/i }).last().click();
    await expect(page.locator('main label').filter({ hasText: 'Playas del Coco' }).first()).toBeVisible();
  } finally { await f.browser.close(); }
});

test('INVALID (0 duration / no price / no departures): none of them is offered either', async () => {
  const bad = [
    packageRow('zero', 'Zero Duration', { duration_minutes: 0 }),
    packageRow('free', 'Free Trip', { base_price: 0 }),
    packageRow('noslots', 'No Departures', { departure_times: [] }),
  ];
  const f = await fixture({ packages: [packageRow('pkg-good', 'Half Day'), ...bad], availability: okSlots }); const { page } = f;
  try {
    await openTour(page);
    await expect(page.getByRole('button', { name: /From USD 650/ }).first()).toBeVisible();
    const text = await pageText(page);
    assert.match(text, /Fishing - Half Day/);
    for (const name of ['Zero Duration', 'Free Trip', 'No Departures']) assert.doesNotMatch(text, new RegExp(name));
    assert.equal(await page.locator('main label').filter({ hasText: /Zero Duration|Free Trip|No Departures/ }).count(), 0);
  } finally { await f.browser.close(); }
});

test('FALLBACK (EN): a package that still reaches availability and is rejected shows the friendly message, blocks continuing and lets the customer pick another package', async () => {
  const f = await fixture({
    packages: [packageRow('pkg-broken', 'Half Day'), packageRow('pkg-ok', 'Full Day', { base_price: 900 })],
    availability: (route, body) => (body.tourPackageId === 'pkg-broken' ? packageMissing(route) : okSlots(route)),
  }); const { page, warnings } = f;
  try {
    const booking = await openTour(page);
    await pickPackage(page, 'Half Day');
    await page.getByLabel(/Date/i).fill('2026-12-01');
    await expect(page.getByText(FRIENDLY_EN)).toBeVisible();
    await expect(page.getByText(GENERIC_EN)).toHaveCount(0);
    assert.doesNotMatch(await pageText(page), TECHNICAL);
    await expect(booking.getByRole('button', { name: /Continue/i }).last()).toBeDisabled();
    // The page is not blocked and the rest of the selection is kept: choose the other package and go on.
    await expect(page.getByLabel(/Date/i)).toHaveValue('2026-12-01');
    await pickPackage(page, 'Full Day');
    await expect(page.getByText(FRIENDLY_EN)).toHaveCount(0);
    await page.locator('main label').filter({ hasText: 'Morning' }).first().click();
    await booking.getByRole('button', { name: /Continue/i }).last().click();
    await expect(page.locator('main label').filter({ hasText: 'Playas del Coco' }).first()).toBeVisible();
    // Internal diagnosis (never shown to the customer): which package / link failed.
    const log = warnings.find((line) => line.includes('[booking] package cannot be booked'));
    assert.ok(log, `expected an internal warning, got ${JSON.stringify(warnings)}`);
  } finally { await f.browser.close(); }
});

test('FALLBACK (ES): the same friendly message in Spanish, never the generic or a technical one', async () => {
  const f = await fixture({ language: 'es', packages: [packageRow('pkg-broken', 'Half Day')], availability: packageMissing }); const { page } = f;
  try {
    await page.goto(`${base}/reservar`);
    const accept = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
    if (await accept.isVisible().catch(() => false)) await accept.click();
    const booking = page.locator('main');
    await booking.getByRole('button', { name: /Continuar|Continue/i }).first().click();
    await booking.getByRole('button', { name: /Pesca|Fishing/i }).first().click();
    await page.getByLabel(/Fecha|Date/i).fill('2026-12-01');
    await expect(page.getByText(FRIENDLY_ES)).toBeVisible();
    await expect(page.getByText(GENERIC_ES)).toHaveCount(0);
    assert.doesNotMatch(await pageText(page), TECHNICAL);
  } finally { await f.browser.close(); }
});

test('REAL failures keep the generic message: a network error and a backend 500 are NOT reported as a package problem', async () => {
  for (const [label, availability] of [['network', (route) => route.abort()], ['500', (route) => route.fulfill({ status: 500, json: { message: 'Availability could not be loaded' } })]]) {
    const f = await fixture({ packages: [packageRow('pkg-1', 'Half Day')], availability }); const { page } = f;
    try {
      await openTour(page);
      await page.getByLabel(/Date/i).fill('2026-12-01');
      await expect(page.getByText(GENERIC_EN), label).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(FRIENDLY_EN), label).toHaveCount(0);
    } finally { await f.browser.close(); }
  }
});
