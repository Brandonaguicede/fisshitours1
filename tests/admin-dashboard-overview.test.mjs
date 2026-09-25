// Dashboard overview in a real browser: KPI cards, the four analytics, the latest five reservations and the empty state,
// desktop and phone width, light and dark. The Supabase project is mocked (admin-test.supabase.co); the fixture is built
// relative to "now" in multiples of 7 days so its calendar week never depends on the weekday the test runs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const EMPTY = 'Aún no hay suficientes reservas para mostrar esta tendencia.';
const DAY = 86_400_000;
const shots = process.env.DASHBOARD_SHOTS_DIR;

const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

// id, age (ms before now), customer, boat, tour, payment method key/name, booking_status, payment_status, total
const FIXTURE = [
  ['bk-a', 0, 'Cliente A', 'Papagayo I', 'Snorkel', 'paypal', 'PayPal', 'confirmed', 'paid', 250, '2026-10-01'],
  ['bk-b', 60_000, 'Cliente B', 'Papagayo I', 'Snorkel', 'whatsapp-link', 'Pago por WhatsApp', 'pending_payment', 'pending', 100, '2026-10-02'],
  ['bk-c', 7 * DAY, 'Cliente C', 'Marlin', 'Pesca', 'paypal', 'PayPal', 'pending_confirmation', 'paid', 120, '2026-10-03'],
  ['bk-d', 7 * DAY, 'Cliente D', 'Marlin', 'Pesca', 'whatsapp-link', 'Pago por WhatsApp', 'confirmed', 'paid', 150, '2026-10-04'],
  ['bk-e', 14 * DAY, 'Cliente E', 'Papagayo I', 'Atardecer', 'pay-on-day', 'Pagar el día del tour', 'pending_confirmation', 'not_required_yet', 80, '2026-10-05'],
  ['bk-f', 21 * DAY, 'Cliente F', 'Marlin', 'Pesca', 'paypal', 'PayPal', 'cancelled', 'refunded', 90, '2026-10-06'], // cancelled: KPIs yes, analytics no
  ['bk-g', 28 * DAY, 'Cliente G', 'Papagayo I', 'Snorkel', 'paypal', 'PayPal', 'completed', 'paid', 300, '2026-10-07'],
  ['bk-h', 100 * DAY, 'Cliente H', 'Papagayo I', 'Snorkel', 'paypal', 'PayPal', 'completed', 'paid', 500, '2026-10-08'], // older than 12 weeks: KPIs yes, analytics no
];

function bookingRows() {
  const now = Date.now();
  return FIXTURE.map(([id, age, customer, boat, tour, methodKey, methodName, booking_status, payment_status, total, tourDate]) => ({
    id, created_at: new Date(now - age).toISOString(), booking_reference: `PFT-${id}`, tour_date: tourDate, boat_id: boat.toLowerCase(), tour_id: tour.toLowerCase(),
    payment_status, payment_method_key: methodKey, booking_status, total_snapshot: total,
    customers: { full_name: customer }, boats: { name: boat }, tours: { title: tour }, payment_methods: { name: methodName }, payments: [],
  }));
}

async function openDashboard(browser, { rows, viewport = { width: 1280, height: 900 } }) {
  const page = await browser.newPage({ viewport });
  const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
  const bookingRequests = [];
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/token')) return route.fulfill({ json: { access_token: 'test-admin-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
    if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: { id: user.id, email: user.email, full_name: 'Test Admin', role: 'admin', active: true } });
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: user });
    if (url.pathname.endsWith('/reviews')) return route.fulfill({ json: [], headers: { 'content-range': '*/2', 'access-control-expose-headers': 'content-range' } });
    if (url.pathname.endsWith('/bookings')) { bookingRequests.push(url); return route.fulfill({ json: rows }); }
    if (url.pathname.endsWith('/rpc/list_admin_bookings')) return route.fulfill({ json: { rows: [], total: 0 } });
    return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
  });
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill('admin@example.com');
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.locator('.admin-stat-card').first()).toBeVisible();
  return { page, base, bookingRequests };
}

const card = (page, label) => page.locator('.admin-stat-card').filter({ hasText: label }).locator('.admin-stat-card__value');
const chart = (page, title) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, level: 3 }) });

async function screenshot(page, name) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.width, height: 2600 }); // tall enough for the whole panel, so element shots are not clipped
  await page.locator('.admin-dashboard-reservations').screenshot({ path: path.join(shots, `recent-${name}`) });
  await page.locator('.admin-dash-analytics').screenshot({ path: path.join(shots, `analytics-${name}`) });
  await page.setViewportSize(viewport);
}

test('dashboard with data: compact KPIs, the four analytics, the latest five and a working "Ver todas"', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const { page, base, bookingRequests } = await openDashboard(browser, { rows: bookingRows() });

    // KPIs: every booking counts (8), analytics rules do not leak into them.
    await expect(card(page, 'Reservas totales')).toHaveText('8');
    await expect(card(page, 'Pagos pendientes')).toHaveText('1'); // bk-b
    await expect(card(page, 'Ingresos')).toHaveText('$1,320'); // paid: 250 + 120 + 150 + 300 + 500
    await expect(card(page, 'Pagos confirmados')).toHaveText('5');
    await expect(card(page, 'Reservas por confirmar')).toHaveText('3'); // bk-b, bk-c (PayPal already paid), bk-e
    await expect(card(page, 'Comentarios por revisar')).toHaveText('2');
    // Compact: six cards, none of them tall (the old grid used large cards).
    assert.equal(await page.locator('.admin-stat-card').count(), 6);
    const heights = await page.locator('.admin-stat-card').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert.ok(Math.max(...heights) <= 90, `KPI cards stay compact, got ${heights}`);

    // One scan of bookings serves the KPIs, the analytics and the recent list: a single request, no N+1.
    assert.equal(bookingRequests.length, 1, 'one bookings request for the whole overview');
    assert.match(bookingRequests[0].search, /select=id%2Ccreated_at|select=id,created_at/);

    // Period and rule are visible.
    const analytics = page.getByRole('region', { name: 'Analítica de reservas' });
    await expect(analytics).toContainText('Últimas 12 semanas');
    await expect(analytics).toContainText('sin las canceladas');
    // Demanda por bote: Papagayo I 4 (bk-a, bk-b, bk-e, bk-g), Marlin 2 (bk-c, bk-d). Cancelled bk-f and the 100-day-old bk-h are out.
    const boats = chart(page, 'Demanda por bote').getByRole('listitem');
    await expect(boats).toHaveCount(2);
    await expect(boats.nth(0)).toContainText('Papagayo I');
    await expect(boats.nth(0)).toContainText('4');
    await expect(boats.nth(1)).toContainText('Marlin');
    await expect(boats.nth(1)).toContainText('2');
    // Demanda por tour: Snorkel 3, Pesca 2, Atardecer 1.
    const tours = chart(page, 'Demanda por tour').getByRole('listitem');
    await expect(tours).toHaveText([/Snorkel\s*3/, /Pesca\s*2/, /Atardecer\s*1/]);
    // Reservas por semana: 12 columns, oldest first; current week 2, previous 2, two weeks ago 1, four weeks ago 1.
    const weeks = chart(page, 'Reservas por semana').getByRole('listitem');
    await expect(weeks).toHaveCount(12);
    const weekCounts = await weeks.evaluateAll((nodes) => nodes.map((node) => Number(node.querySelector('.admin-dash-weeks__count').textContent)));
    assert.deepEqual(weekCounts, [0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 2, 2]);
    await expect(weeks.nth(11)).toContainText('Semana del');
    await expect(weeks.nth(11)).toContainText('(en curso)');
    await expect(weeks.nth(11)).toContainText('2 reservas');
    await expect(weeks.nth(8)).toContainText('0 reservas'); // quiet weeks stay in the timeline
    // Método de pago: PayPal 3 (50%), WhatsApp 2 (33%), Día del tour 1 (17%); the most used one is spelled out.
    const methods = chart(page, 'Método de pago');
    await expect(methods).toContainText('Método más usado');
    await expect(methods.locator('.admin-dash-highlight')).toContainText('PayPal');
    await expect(methods.locator('.admin-dash-highlight')).toContainText('3 reservas · 50%');
    await expect(methods.getByRole('listitem')).toHaveText([/PayPal\s*3 · 50%/, /WhatsApp\s*2 · 33%/, /Día del tour\s*1 · 17%/]);
    assert.equal(await methods.locator('.admin-dash-donut__seg').count(), 3);
    await expect(page.getByText(EMPTY)).toHaveCount(0);

    // Reservas recientes: exactly the newest five (A, B, D, C, E), customer + tour date + payment only.
    const recent = page.getByRole('region', { name: 'Reservas recientes' }).or(page.locator('.admin-dashboard-reservations'));
    await expect(recent.getByRole('heading', { name: 'Reservas recientes', level: 2 })).toBeVisible();
    await expect(recent.getByRole('columnheader')).toHaveText(['Cliente', 'Fecha del tour', 'Pago']);
    const rows = recent.locator('tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.locator('td:first-child')).toHaveText(['Cliente A', 'Cliente B', 'Cliente D', 'Cliente C', 'Cliente E']);
    await expect(rows.nth(0)).toContainText('1 oct 2026');
    await expect(rows.nth(0)).toContainText('Pagado');
    await expect(rows.nth(1)).toContainText('Pendiente');
    await expect(rows.nth(4)).toContainText('Pago en tour');
    for (const absent of ['Cliente F', 'Cliente G', 'Cliente H', 'PFT-', 'Test Tour']) await expect(recent).not.toContainText(absent);

    // Ver todas: accessible link with a focus ring, leads to the reservations list.
    const viewAll = recent.getByRole('link', { name: 'Ver todas' });
    await expect(viewAll).toHaveAttribute('href', '/admin/reservations');
    // Reached with the keyboard (Tab), so :focus-visible applies.
    let reached = false;
    for (let i = 0; i < 80 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await viewAll.evaluate((node) => node === document.activeElement);
    }
    assert.ok(reached, 'Ver todas is reachable with Tab');
    assert.notEqual(await viewAll.evaluate((node) => getComputedStyle(node).outlineStyle), 'none', 'focus ring is visible');
    // DOM order matches the visual order: KPIs, recent reservations, analytics.
    const order = await page.evaluate(() => {
      const top = (selector) => document.querySelector(selector).getBoundingClientRect().top;
      return [top('.admin-stat-grid'), top('.admin-dashboard-reservations'), top('.admin-dash-analytics')];
    });
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.equal(await page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').count(), 0, 'no positive tabindex');

    await screenshot(page, 'dashboard-desktop-light.png');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await expect(page.locator('.admin-dash-chart').first()).toBeVisible();
    await screenshot(page, 'dashboard-desktop-dark.png');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });

    await viewAll.click();
    await expect(page).toHaveURL(`${base}/admin/reservations`);
  } finally {
    await browser.close();
  }
});

test('dashboard on a phone: nothing overflows and every chart stays readable, light and dark', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const { page } = await openDashboard(browser, { rows: bookingRows(), viewport: { width: 375, height: 812 } });
    await expect(chart(page, 'Método de pago').locator('.admin-dash-donut__seg').first()).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `no horizontal page scroll in ${theme} (overflow ${overflow}px)`);
      // Charts are stacked in one column and fit inside the viewport.
      const boxes = await page.locator('.admin-dash-chart').evaluateAll((nodes) => nodes.map((node) => { const box = node.getBoundingClientRect(); return [Math.round(box.left), Math.round(box.right)]; }));
      assert.equal(boxes.length, 4);
      for (const [left, right] of boxes) assert.ok(left >= 0 && right <= 375, `chart inside viewport: ${left}-${right}`);
      // Only every second week label is drawn on a phone, and the current week's is always one of them.
      const visibleLabels = await page.locator('.admin-dash-weeks__label').evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).visibility !== 'hidden').length);
      assert.equal(visibleLabels, 6);
      assert.notEqual(await page.locator('.admin-dash-weeks__item').last().locator('.admin-dash-weeks__label').evaluate((node) => getComputedStyle(node).visibility), 'hidden');
      await screenshot(page, `dashboard-mobile-${theme}.png`);
    }
    // The recent list fits at 375px with all three columns: no inner scroll needed.
    await expect(page.locator('.admin-dashboard-reservations tbody tr')).toHaveCount(5);
    const wrap = page.locator('.admin-dashboard-reservations .admin-table-wrap');
    assert.ok(await wrap.evaluate((node) => node.scrollWidth <= node.clientWidth), 'recent reservations table needs no horizontal scroll');
    assert.ok(await page.locator('.admin-dashboard-reservations th').last().evaluate((node) => node.getBoundingClientRect().right <= innerWidth), 'the Pago column is inside the viewport');
  } finally {
    await browser.close();
  }
});

test('dashboard without bookings: KPIs at zero, every chart says there is not enough data, no broken charts', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const { page } = await openDashboard(browser, { rows: [] });
    for (const label of ['Reservas totales', 'Pagos pendientes', 'Pagos confirmados', 'Reservas por confirmar']) await expect(card(page, label)).toHaveText('0');
    await expect(card(page, 'Ingresos')).toHaveText('$0');
    // Exactly the same sentence in each of the four cards, and nothing drawn.
    for (const title of ['Demanda por bote', 'Demanda por tour', 'Reservas por semana', 'Método de pago']) {
      const empty = chart(page, title).getByText(EMPTY, { exact: true });
      await expect(empty).toBeVisible();
      await expect(empty).toHaveCount(1);
    }
    await expect(page.getByText(EMPTY, { exact: true })).toHaveCount(4);
    await expect(page.locator('.admin-dash-bars, .admin-dash-weeks, .admin-dash-donut')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Analítica de reservas' })).toContainText('Últimas 12 semanas');
    // Recent reservations: honest empty row, and the way to the full list is still there.
    await expect(page.locator('.admin-dashboard-reservations')).toContainText('No hay reservas registradas todavía.');
    await expect(page.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/admin/reservations');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await screenshot(page, 'dashboard-empty-desktop.png');
  } finally {
    await browser.close();
  }
});

test('bookings that are all cancelled or outside the 12 weeks still show the empty analytics, while the KPIs keep counting them', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const rows = bookingRows().filter((row) => ['bk-f', 'bk-h'].includes(row.id));
    const { page } = await openDashboard(browser, { rows });
    await expect(card(page, 'Reservas totales')).toHaveText('2');
    await expect(page.getByText(EMPTY, { exact: true })).toHaveCount(4);
    await expect(page.locator('.admin-dash-bars, .admin-dash-weeks, .admin-dash-donut')).toHaveCount(0);
  } finally {
    await browser.close();
  }
});
