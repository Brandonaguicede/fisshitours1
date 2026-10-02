// Public booking: the package's "Incluye" list (Admin -> Boats -> Packages -> Includes, stored in tour_packages.package_included
// + package_included_es / _en) is shown in Tour Details between the package chooser and Date / Guests, and as a compact row
// in the Reservation Summary. It depends only on the selected package; EN/ES follow the existing stored-translation flow.
// Same page.route mocking as the other public booking tests (no real Supabase, no payments).
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';

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

async function fixture({ packages, language = 'en' }) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });
  await page.addInitScript((value) => window.localStorage.setItem('language', value), language);
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/boats')) return route.fulfill({ json: [boatRow] });
    if (path.endsWith('/tour_packages')) return route.fulfill({ json: packages });
    if (path.endsWith('/time_slots')) return route.fulfill({ json: [{ id: 'slot-1', label: 'Morning', starts_at: '07:00:00' }] });
    if (path.endsWith('/functions/v1/get-booking-availability')) return route.fulfill({ json: { slots: [{ id: 'slot-1', label: 'Morning', time: '07:00', available: true }] } });
    if (path.endsWith('/functions/v1/calculate-booking-price')) return route.fulfill({ json: { custom_quote: false, base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, extra_guests: 0, extra_guests_total: 0, extras: [], extras_total: 0, total: 650, currency: 'USD' } });
    return route.fulfill({ json: [] });
  });
  return { browser, page };
}

async function openTour(page) {
  await page.goto(`${base}/reservar`);
  const accept = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  const booking = page.locator('main');
  await booking.getByRole('button', { name: /Continue|Continuar/i }).first().click();
  await booking.getByRole('button', { name: /Fishing|Pesca/i }).first().click();
}
const pickPackage = (page, name) => page.locator('main label').filter({ hasText: name }).first().click();
// The step section (not the summary row) and its items.
const includedSection = (page) => page.locator('section[aria-labelledby="booking-included-title"]');
const includedItems = (page) => includedSection(page).locator('li');
const summary = (page) => page.locator('aside:not([role=dialog])');

test('a package with included items shows each one as its own item, between the package chooser and Date / Guests', async () => {
  const f = await fixture({ packages: [packageRow('a', 'Half Day', { package_included: ['Life jacket', 'Drinks', 'Fishing gear'], package_included_en: ['Life jacket', 'Drinks', 'Fishing gear'], package_included_es: ['Chaleco salvavidas', 'Bebidas', 'Equipo de pesca'] }), packageRow('b', 'Full Day')] });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    await expect(includedSection(f.page).getByRole('heading', { name: 'Included' })).toBeVisible();
    await expect(includedItems(f.page)).toHaveText(['Life jacket', 'Drinks', 'Fishing gear']); // one line = one item
    const chooser = await f.page.locator('main label').filter({ hasText: 'Full Day' }).first().boundingBox();
    const section = await includedSection(f.page).boundingBox();
    const date = await f.page.getByLabel(/Date/i).boundingBox();
    assert.ok(chooser.y < section.y && section.y < date.y, 'Included sits after the package chooser and before Date');
  } finally { await f.browser.close(); }
});

test('a package without included items renders no Included section (step or summary)', async () => {
  const f = await fixture({ packages: [packageRow('a', 'Half Day', { package_included: [], package_included_en: [], package_included_es: [] }), packageRow('b', 'Full Day')] });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    await expect(f.page.getByLabel(/Date/i)).toBeVisible();
    await expect(includedSection(f.page)).toHaveCount(0);
    await expect(f.page.getByRole('heading', { name: 'Included' })).toHaveCount(0);
    await expect(summary(f.page).getByText('Included', { exact: true })).toHaveCount(0);
  } finally { await f.browser.close(); }
});

test('changing the package replaces the list immediately (and hides it for a package with none)', async () => {
  const f = await fixture({ packages: [
    packageRow('a', 'Half Day', { package_included: ['Life jacket', 'Drinks'], package_included_en: ['Life jacket', 'Drinks'], package_included_es: ['Chaleco', 'Bebidas'] }),
    packageRow('b', 'Full Day', { package_included: ['Lunch', 'Snorkel gear'], package_included_en: ['Lunch', 'Snorkel gear'], package_included_es: ['Almuerzo', 'Equipo de snorkel'] }),
    packageRow('c', 'Sunset', { package_included: [] }),
  ] });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    await expect(includedItems(f.page)).toHaveText(['Life jacket', 'Drinks']);
    await pickPackage(f.page, 'Full Day');
    await expect(includedItems(f.page)).toHaveText(['Lunch', 'Snorkel gear']);
    assert.doesNotMatch(await f.page.locator('main').last().innerText(), /Life jacket/);
    await pickPackage(f.page, 'Sunset');
    await expect(includedSection(f.page)).toHaveCount(0);
    await pickPackage(f.page, 'Half Day');
    await expect(includedItems(f.page)).toHaveText(['Life jacket', 'Drinks']);
  } finally { await f.browser.close(); }
});

test('the Reservation Summary shows a compact Included row that follows the package and caps long lists', async () => {
  const many = ['Life jacket', 'Drinks', 'Snacks', 'Towel', 'Sunscreen', 'Cooler'];
  const f = await fixture({ packages: [
    packageRow('a', 'Half Day', { package_included: ['Life jacket', 'Drinks'], package_included_en: ['Life jacket', 'Drinks'] }),
    packageRow('b', 'Full Day', { package_included: many, package_included_en: many }),
  ] });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    await expect(summary(f.page)).toContainText('Included');
    await expect(summary(f.page)).toContainText('Life jacket, Drinks');
    await pickPackage(f.page, 'Full Day');
    await expect(summary(f.page)).toContainText('Life jacket, Drinks, Snacks, Towel +2 more');
    assert.doesNotMatch(await summary(f.page).innerText(), /Sunscreen|Cooler/); // the full list lives in the step
    await expect(includedItems(f.page)).toHaveCount(6);
  } finally { await f.browser.close(); }
});

test('EN shows the original and ES the stored translation; a missing translation falls back to the original', async () => {
  const packages = [
    packageRow('a', 'Half Day', { name_en: 'Half Day', name_es: 'Medio dia', package_included: ['Life jacket', 'Drinks'], package_included_en: ['Life jacket', 'Drinks'], package_included_es: ['Chaleco salvavidas', 'Bebidas'] }),
    packageRow('b', 'Full Day', { name_en: 'Full Day', name_es: 'Dia completo', package_included: ['Lunch'] }), // older record: no stored translation yet
  ];
  const es = await fixture({ packages, language: 'es' });
  try {
    await openTour(es.page);
    await pickPackage(es.page, 'Medio dia');
    await expect(includedSection(es.page).getByRole('heading', { name: 'Incluye' })).toBeVisible();
    await expect(includedItems(es.page)).toHaveText(['Chaleco salvavidas', 'Bebidas']);
    await expect(summary(es.page)).toContainText('Chaleco salvavidas, Bebidas');
    await pickPackage(es.page, 'Dia completo');
    await expect(includedItems(es.page)).toHaveText(['Lunch']);
  } finally { await es.browser.close(); }
  const en = await fixture({ packages, language: 'en' });
  try {
    await openTour(en.page);
    await pickPackage(en.page, 'Half Day');
    await expect(includedItems(en.page)).toHaveText(['Life jacket', 'Drinks']);
  } finally { await en.browser.close(); }
});
