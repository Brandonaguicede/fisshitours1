// Public tour detail (modal): three content levels, each from its own source and shown once.
//   TOUR      tours.description (+ highlights)          -> shown once, always, whatever package is selected
//   PACKAGE   tour_packages.* (own description, duration, capacity, included guests, extra guest price,
//             package_included or the tour's list when the package inherits, meals)
//   DEPARTURE the package's resolved time slots (its own departure_times, else the shared time_slots)
// Free text is never parsed: an "Includes: ..." typed by hand in a description stays exactly as written.
// Same page.route mocking as the other public tests (no real Supabase, no payments).
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';

const boatRow = { id: 'boat-1', slug: 'second-wind', name: 'Second Wind', image_url: null, images: null, badge: null, length: '32ft', engine: 'Yamaha 250', max_guests: 10, featured_spec: null, active: true, sort_order: 1 };
const TOUR_DESCRIPTION = 'A relaxed day on the water. Includes: Drinks and snacks';
const tourRow = {
  id: 'tour-1', title: 'Beach Tour', category: 'Snorkeling & Beach', description: TOUR_DESCRIPTION, description_en: TOUR_DESCRIPTION,
  description_es: 'Un día tranquilo en el agua. Incluye: Bebidas y snacks', image_url: null, active: true,
  highlights: ['Snorkeling', 'Swimming'], highlights_en: ['Snorkeling', 'Swimming'], highlights_es: ['Snorkel', 'Natación'],
  included: ['Tour drinks'], included_en: ['Tour drinks'], included_es: ['Bebidas del tour'],
};
const packageRow = (id, name, extra = {}) => ({
  id, active: true, name, package_type: id, departure_times: ['08:00'], meal_options: null, description: null, package_included: null, duration_minutes: 240, sort_order: 1,
  base_price: 650, included_guests: 4, max_guests: 8, extra_guest_price: 40, custom_quote: false,
  boat_tours: { id: 'link-1', boat_id: 'boat-1', tour_id: 'tour-1', active: true, boats: { active: true, max_guests: 10 }, tours: tourRow },
  ...extra,
});
const packages = () => [
  packageRow('half', 'Half Day', {
    description: 'Half day package only', description_en: 'Half day package only', description_es: 'Solo el paquete medio día',
    package_included: ['Life jacket', 'Lunch'], package_included_en: ['Life jacket', 'Lunch'], package_included_es: ['Chaleco salvavidas', 'Almuerzo'],
    name_en: 'Half Day', name_es: 'Medio día',
  }),
  packageRow('full', 'Full Day', { base_price: 950, duration_minutes: 480, included_guests: 6, max_guests: 10, extra_guest_price: 60, departure_times: ['13:00'], name_en: 'Full Day', name_es: 'Día completo' }), // inherits the tour's list, no own description
  // Own list explicitly empty; its description repeats the tour's; no own departures -> the shared schedule.
  packageRow('sunset', 'Sunset', { base_price: 500, duration_minutes: 120, included_guests: 2, max_guests: 4, extra_guest_price: 25, departure_times: null, package_included: [], package_included_en: [], package_included_es: [], description: TOUR_DESCRIPTION, description_en: TOUR_DESCRIPTION, name_en: 'Sunset', name_es: 'Atardecer' }),
];

async function fixture({ language = 'en', width = 1366 } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.addInitScript((value) => window.localStorage.setItem('language', value), language);
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/boats')) return route.fulfill({ json: [boatRow] });
    if (path.endsWith('/tour_packages')) return route.fulfill({ json: packages() });
    if (path.endsWith('/time_slots')) return route.fulfill({ json: [{ id: 'am', label: 'Morning', starts_at: '08:00:00' }, { id: 'pm', label: 'Afternoon', starts_at: '13:00:00' }] });
    return route.fulfill({ json: [] });
  });
  return { browser, page };
}

async function openModal(page, viewLabel = /View tour|Ver tour/i) {
  await page.goto(`${base}/`);
  const accept = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await page.getByRole('button', { name: viewLabel }).first().click({ force: true });
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('#tour-detail-title') });
  await expect(dialog).toBeVisible();
  return dialog;
}
const pick = (dialog, name) => dialog.getByRole('button', { name: new RegExp(name) }).first().click();
const occurrences = (text, needle) => text.split(needle).length - 1;

test('the tour description is shown once (as typed, "Includes:" untouched) whichever package is selected', async () => {
  const f = await fixture();
  try {
    const dialog = await openModal(f.page);
    await expect(dialog.getByTestId('tour-description')).toHaveText(TOUR_DESCRIPTION);
    assert.equal(occurrences(await dialog.innerText(), 'A relaxed day on the water'), 1);
    // A package with its own description: both levels visible, the tour one still once.
    await pick(dialog, 'Half Day');
    await expect(dialog.getByTestId('package-description')).toHaveText('Half day package only');
    assert.equal(occurrences(await dialog.innerText(), 'A relaxed day on the water'), 1);
    // A package without one never falls back to the tour's text (no second copy, no empty block).
    await pick(dialog, 'Full Day');
    await expect(dialog.getByTestId('package-description')).toHaveCount(0);
    assert.equal(occurrences(await dialog.innerText(), 'A relaxed day on the water'), 1);
    // A package whose description equals the tour's is not repeated either.
    await pick(dialog, 'Sunset');
    await expect(dialog.getByTestId('package-description')).toHaveCount(0);
    assert.equal(occurrences(await dialog.innerText(), 'A relaxed day on the water'), 1);
  } finally { await f.browser.close(); }
});

test('Included comes only from the structured list, once, and the tour activities are not mixed into it', async () => {
  const f = await fixture();
  try {
    const dialog = await openModal(f.page);
    await expect(dialog.getByTestId('package-included')).toHaveCount(0); // nothing selected yet
    await pick(dialog, 'Half Day');
    const included = dialog.getByTestId('package-included');
    await expect(included.locator('li')).toHaveText(['Life jacket', 'Lunch']);
    assert.equal(await dialog.getByText('Included', { exact: true }).count(), 1);
    const text = await dialog.innerText();
    assert.equal(occurrences(text, 'Life jacket'), 1);
    // Activities belong to the tour level (under its description), not inside Included.
    await expect(dialog.getByTestId('tour-activities')).toHaveText('Snorkeling · Swimming');
    assert.doesNotMatch(await included.innerText(), /Snorkeling|Swimming/);
  } finally { await f.browser.close(); }
});

test('package A and package B each show their own duration, capacity, extra guest price, included and departures', async () => {
  const f = await fixture();
  try {
    const dialog = await openModal(f.page);
    const details = dialog.getByTestId('selected-package-details');
    await pick(dialog, 'Half Day');
    await expect(details).toContainText('4 hours');
    await expect(details).toContainText('8 guests');
    await expect(details).toContainText('4 included');
    await expect(details).toContainText('USD 40');
    await expect(dialog.getByTestId('package-included').locator('li')).toHaveText(['Life jacket', 'Lunch']);
    await expect(dialog.getByTestId('package-departures')).toContainText('8:00 AM');
    await expect(dialog.getByTestId('package-departures')).not.toContainText('1:00 PM');

    await pick(dialog, 'Full Day');
    await expect(details).toContainText('8 hours');
    await expect(details).toContainText('10 guests');
    await expect(details).toContainText('6 included');
    await expect(details).toContainText('USD 60');
    await expect(details).not.toContainText('4 hours');
    await expect(details).not.toContainText('Life jacket');
    await expect(dialog.getByTestId('package-departures')).toContainText('1:00 PM');
    await expect(dialog.getByTestId('package-departures')).not.toContainText('8:00 AM');

    await pick(dialog, 'Half Day'); // and back: nothing stale
    await expect(details).toContainText('4 hours');
    await expect(dialog.getByTestId('package-included').locator('li')).toHaveText(['Life jacket', 'Lunch']);
  } finally { await f.browser.close(); }
});

test('a package that inherits shows the tour\'s list; one with its own empty list shows no Included section; departures fall back to the shared schedule', async () => {
  const f = await fixture();
  try {
    const dialog = await openModal(f.page);
    await pick(dialog, 'Full Day');
    await expect(dialog.getByTestId('package-included').locator('li')).toHaveText(['Tour drinks']); // existing inheritance rule
    await pick(dialog, 'Sunset');
    await expect(dialog.getByTestId('package-included')).toHaveCount(0);
    await expect(dialog.getByText('Included', { exact: true })).toHaveCount(0);
    await expect(dialog.getByTestId('package-departures')).toContainText('8:00 AM, 1:00 PM'); // time_slots, not departure_times
  } finally { await f.browser.close(); }
});

test('EN shows the original, ES the stored translation of each level; a missing translation falls back to the original', async () => {
  const f = await fixture({ language: 'es' });
  try {
    const dialog = await openModal(f.page);
    await expect(dialog.getByTestId('tour-description')).toHaveText('Un día tranquilo en el agua. Incluye: Bebidas y snacks');
    await expect(dialog.getByTestId('tour-activities')).toHaveText('Snorkel · Natación');
    await pick(dialog, 'Medio día');
    await expect(dialog.getByTestId('package-description')).toHaveText('Solo el paquete medio día');
    await expect(dialog.getByTestId('package-included').locator('li')).toHaveText(['Chaleco salvavidas', 'Almuerzo']);
    await expect(dialog.getByText('Incluye', { exact: true })).toHaveCount(1);
    await pick(dialog, 'Día completo');
    await expect(dialog.getByTestId('package-included').locator('li')).toHaveText(['Bebidas del tour']); // inherited, in Spanish
  } finally { await f.browser.close(); }
});

test('mobile: no horizontal overflow and no duplicated blocks', async () => {
  const f = await fixture({ width: 390 });
  try {
    const dialog = await openModal(f.page);
    await pick(dialog, 'Half Day');
    await expect(dialog.getByTestId('package-included')).toBeVisible();
    const overflow = await f.page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dialog: [...document.querySelectorAll('[role="dialog"]')].map((el) => el.scrollWidth - el.clientWidth),
    }));
    assert.ok(overflow.page <= 0, `page overflows by ${overflow.page}px`);
    assert.ok(overflow.dialog.every((value) => value <= 0), `dialog overflows: ${overflow.dialog}`);
    const text = await dialog.innerText();
    assert.equal(occurrences(text, 'A relaxed day on the water'), 1);
    assert.equal(occurrences(text, 'Life jacket'), 1);
    assert.equal(occurrences(text, 'Departure times'), 1);
  } finally { await f.browser.close(); }
});
