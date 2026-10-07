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

async function fixture({ packages, language = 'en', width = 1366, slots = [{ id: 'slot-1', label: 'Morning', time: '07:00' }] }) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width, height: 1200 } });
  await page.addInitScript((value) => window.localStorage.setItem('language', value), language);
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/boats')) return route.fulfill({ json: [boatRow] });
    if (path.endsWith('/tour_packages')) return route.fulfill({ json: packages });
    if (path.endsWith('/time_slots')) return route.fulfill({ json: slots.map((slot) => ({ id: slot.id, label: slot.label, starts_at: slot.time + ':00' })) });
    if (path.endsWith('/functions/v1/get-booking-availability')) return route.fulfill({ json: { slots: slots.map((slot) => ({ ...slot, available: true })) } });
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
    await expect(summary(f.page)).toContainText('Life jacket • Drinks');
    await pickPackage(f.page, 'Full Day');
    await expect(summary(f.page)).toContainText('Life jacket • Drinks • Snacks • Towel • +2 more');
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
    await expect(summary(es.page)).toContainText('Chaleco salvavidas • Bebidas');
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

const LONG_ITEMS = ['Alcoholic and non-alcoholic beverages', 'Bottled water', 'Chips with guacamole and pico de gallo', 'Seasonal fruits', 'Snorkeling gear', 'Paddle board'];
const longPackages = () => [packageRow('a', 'Half Day', { package_included: LONG_ITEMS, package_included_en: LONG_ITEMS }), packageRow('b', 'Full Day')];

// Reservation Summary: "Included" follows the card's label | value pattern (label left, value right-aligned) and its value may wrap onto
// several lines. Measured against the Guests row of the same card, so the rows must really line up.
// The card is desktop-only (>= lg, 1024px); 1024 is its narrowest case.
for (const [name, width] of [['desktop', 1366], ['narrowest desktop, lg breakpoint', 1024]]) {
  test(`Reservation Summary (${name}): Included keeps label left / value right like the other rows, wraps onto several lines and does not overflow`, async () => {
    const f = await fixture({ width, packages: longPackages() });
    try {
      await openTour(f.page);
      await pickPackage(f.page, 'Half Day');
      await expect(summary(f.page).getByText('Included', { exact: true })).toBeVisible();
      const m = await f.page.evaluate(() => {
        const aside = document.querySelector('aside:not([role=dialog])');
        const rowOf = (re) => [...aside.querySelectorAll('div.flex.justify-between')].find((row) => re.test(row.firstElementChild.textContent));
        const rect = (el) => el.getBoundingClientRect();
        const included = rowOf(/^Included$/); const guests = rowOf(/^Guests$/);
        const [iLabel, iValue] = [included.children[0], included.children[1]]; const [gLabel, gValue] = [guests.children[0], guests.children[1]];
        const style = (el) => getComputedStyle(el);
        return {
          value: iValue.textContent, display: style(included).display, justify: style(included).justifyContent, textAlign: style(iValue).textAlign,
          labelLeftDelta: Math.abs(rect(iLabel).left - rect(gLabel).left), valueRightDelta: Math.abs(rect(iValue).right - rect(gValue).right),
          labelBeforeValue: rect(iLabel).right <= rect(iValue).left, valueWidthShare: rect(iValue).width / rect(included).width,
          lines: Math.round(rect(iValue).height / parseFloat(style(iValue).lineHeight)),
          fontSize: [style(iValue).fontSize, style(gValue).fontSize], labelFont: [style(iLabel).fontSize, style(gLabel).fontSize],
          overflow: { page: document.documentElement.scrollWidth - innerWidth, aside: aside.scrollWidth - aside.clientWidth, row: included.scrollWidth - included.clientWidth },
        };
      });
      // Built from the list items, bullet-separated, capped at four plus "+N more".
      assert.equal(m.value, 'Alcoholic and non-alcoholic beverages • Bottled water • Chips with guacamole and pico de gallo • Seasonal fruits • +2 more');
      assert.equal(m.display, 'flex'); assert.equal(m.justify, 'space-between');
      assert.ok(m.labelLeftDelta <= 1, 'label shares the left edge with the other labels');
      assert.ok(m.valueRightDelta <= 1, `value shares the right edge with the other values (${m.valueRightDelta}px)`);
      assert.ok(m.labelBeforeValue, 'label and value sit side by side');
      assert.equal(m.textAlign, 'right');
      assert.ok(m.valueWidthShare <= 0.75, `label keeps its room (value uses ${m.valueWidthShare})`);
      assert.ok(m.lines >= 2, `a long list wraps onto several lines (${m.lines})`);
      assert.equal(m.fontSize[0], m.fontSize[1], 'same font size as the other values'); assert.equal(m.labelFont[0], m.labelFont[1]);
      assert.ok(m.overflow.page <= 0 && m.overflow.aside <= 0 && m.overflow.row <= 0, `no horizontal overflow: ${JSON.stringify(m.overflow)}`);
    } finally { await f.browser.close(); }
  });
}

test('Reservation Summary: a short list stays on one line, still label left / value right', async () => {
  const f = await fixture({ packages: [packageRow('a', 'Half Day', { package_included: ['Life jacket', 'Drinks'], package_included_en: ['Life jacket', 'Drinks'] }), packageRow('b', 'Full Day')] });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    const row = summary(f.page).locator('div.flex.justify-between').filter({ hasText: /^Included/ });
    await expect(row.locator('span').nth(1)).toHaveText('Life jacket • Drinks');
    const lines = await row.locator('span').nth(1).evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    assert.equal(lines, 1);
  } finally { await f.browser.close(); }
});

test('Reservation Summary on a phone: the card is replaced by the compact bar (as before) and the page has no horizontal overflow', async () => {
  const f = await fixture({ width: 390, packages: longPackages() });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    await expect(includedItems(f.page)).toHaveCount(6); // the full list is in the step itself
    await expect(summary(f.page)).toBeHidden();
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, true, 'no horizontal overflow');
  } finally { await f.browser.close(); }
});

// Date and Guests: one visual family (same height, radius, border, background), compact on desktop, fluid on a phone.
const dateBox = (page) => page.locator('#booking-date');
const guestsBox = (page) => page.getByTestId('guests-stepper');
const measure = (locator) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { width: r.width, height: r.height, radius: s.borderTopLeftRadius, border: s.borderTopColor + '|' + s.borderTopWidth, background: s.backgroundColor, left: r.left, right: r.right, top: r.top }; });

test('Date and Guests (desktop): same height, radius, border and background; compact, not stretched; pill shape is gone', async () => {
  const f = await fixture({ packages: longPackages() });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    const [date, guests, row] = [await measure(dateBox(f.page)), await measure(guestsBox(f.page)), await measure(f.page.locator('main').last())];
    assert.equal(date.height, guests.height, 'same height');
    assert.equal(date.height, 44);
    assert.equal(date.radius, guests.radius, 'same border radius');
    assert.ok(parseFloat(guests.radius) <= 16, `not a pill (${guests.radius})`);
    assert.equal(date.border, guests.border, 'same border'); assert.equal(date.background, guests.background, 'same background');
    assert.ok(date.width <= 200 && date.width >= 150, `Date is as wide as a date needs (${date.width}px)`);
    assert.ok(guests.width <= 150 && guests.width >= 120, `Guests is as wide as "- 5 +" needs (${guests.width}px)`);
    assert.ok(date.width + guests.width < row.width * 0.5, 'together they use well under half of the content width');
    assert.equal(Math.round(date.top), Math.round(guests.top), 'they share one row');
    assert.ok(guests.left >= date.right, 'side by side, not overlapping');
    // The - / + controls keep a comfortable hit target and still work.
    const minus = f.page.getByRole('button', { name: 'Decrease guests' }); const plus = f.page.getByRole('button', { name: 'Increase guests' });
    const hit = await plus.boundingBox(); assert.ok(hit.width >= 32 && hit.height >= 32, `hit target ${hit.width}x${hit.height}`);
    const before = Number(await f.page.locator('#booking-guests').inputValue());
    await plus.click(); await expect(f.page.locator('#booking-guests')).toHaveValue(String(before + 1));
    await minus.click(); await expect(f.page.locator('#booking-guests')).toHaveValue(String(before));
  } finally { await f.browser.close(); }
});

test('Date and Guests (phone): same geometry, they share the row and grow with the width, no overflow', async () => {
  const f = await fixture({ width: 390, packages: longPackages() });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    const [date, guests] = [await measure(dateBox(f.page)), await measure(guestsBox(f.page))];
    assert.equal(date.height, guests.height); assert.equal(date.radius, guests.radius); assert.equal(date.border, guests.border);
    assert.ok(date.width > 140 && guests.width > 140, `both grow on a phone (${date.width} / ${guests.width})`);
    assert.ok(date.right <= 390 && guests.right <= 390, 'inside the viewport');
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, true, 'no horizontal overflow');
  } finally { await f.browser.close(); }
});

test('Guests: the extra-guest notice spans the full width below the compact controls instead of being squeezed under them', async () => {
  const f = await fixture({ packages: longPackages() });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    for (let i = 0; i < 3; i += 1) await f.page.getByRole('button', { name: 'Increase guests' }).click();
    const notice = f.page.locator('#booking-guests-extra');
    await expect(notice).toBeVisible();
    const [guests, box] = [await measure(guestsBox(f.page)), await notice.boundingBox()];
    assert.ok(box.width > guests.width * 2.5, `notice is wider than the Guests control (${box.width} vs ${guests.width})`);
    assert.ok(box.y >= guests.top + guests.height, 'below the controls');
    await expect(f.page.locator('#booking-guests')).toHaveAttribute('aria-describedby', /booking-guests-extra/);
  } finally { await f.browser.close(); }
});

// Departure time: chronological order for display, whatever order the slots are stored in. Only the presentation is sorted.
const STORED_ORDER = [
  { id: 's-7', label: 'Seven', time: '07:00' }, { id: 's-6', label: 'Six', time: '06:00' }, { id: 's-14', label: 'Two PM', time: '14:00' },
  { id: 's-8', label: 'Eight', time: '08:00' }, { id: 's-12', label: 'Noon', time: '12:00' }, { id: 's-1130', label: 'Late morning', time: '11:30' },
];
const shownTimes = (page) => page.locator('input[name="timeSlot"]').evaluateAll((inputs) => inputs.map((input) => [...input.closest('label').querySelectorAll('span')].map((span) => span.textContent.trim()).find((text) => /\d:\d\d/.test(text))));

test('Departure time: always ascending (AM before PM, 11:30 AM < 12:00 PM < 2:00 PM) regardless of the stored order', async () => {
  const f = await fixture({ slots: STORED_ORDER, packages: longPackages() });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    await expect.poll(() => shownTimes(f.page)).toEqual(['6:00 AM', '7:00 AM', '8:00 AM', '11:30 AM', '12:00 PM', '2:00 PM']);
  } finally { await f.browser.close(); }
});

test('Departure time: the selection, its default and the values are untouched by the sort', async () => {
  const f = await fixture({ slots: STORED_ORDER, packages: longPackages() });
  try {
    await openTour(f.page);
    await pickPackage(f.page, 'Half Day');
    await expect.poll(() => shownTimes(f.page)).toHaveLength(6);
    // The default is still decided by the existing logic (first stored slot, 7:00 AM), now shown second.
    await expect(f.page.locator('input[name="timeSlot"]:checked')).toHaveAttribute('value', 's-7');
    // Choosing a slot selects exactly that one, keeps the radio values (slot ids) and keeps it selected after re-renders.
    await f.page.locator('main label').filter({ hasText: /(^|\s)2:00 PM/ }).first().click();
    await expect(f.page.locator('input[name="timeSlot"]:checked')).toHaveAttribute('value', 's-14');
    await expect(summary(f.page)).toContainText('2:00 PM');
    await f.page.getByRole('button', { name: 'Increase guests' }).click(); // re-render
    await expect(f.page.locator('input[name="timeSlot"]:checked')).toHaveAttribute('value', 's-14');
    await f.page.locator('main label').filter({ hasText: '6:00 AM' }).first().click();
    await expect(f.page.locator('input[name="timeSlot"]:checked')).toHaveAttribute('value', 's-6');
    assert.deepEqual(await f.page.locator('input[name="timeSlot"]').evaluateAll((inputs) => inputs.map((input) => input.value)), ['s-6', 's-7', 's-8', 's-1130', 's-12', 's-14']);
  } finally { await f.browser.close(); }
});
