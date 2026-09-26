// Cross-cutting Admin accessibility audit (block J): every control has an accessible name, Tab / Shift+Tab follow the
// natural reading order (never a positive tabindex), focus is always visible, and dialogs trap focus, close on
// Escape and hand focus back. Same in-memory PostgREST pattern as the other admin tests.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const primaryKey = (table) => (table === 'site_settings' || table === 'payment_methods' ? 'key' : 'id');

async function fixture(seed = {}, viewport = { width: 1366, height: 1000 }) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport });
  const store = Object.fromEntries(Object.entries(seed).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
  const matches = (row, params) => [...params.entries()].every(([name, value]) => {
    if (['select', 'order', 'limit', 'offset', 'or', 'columns', 'on_conflict'].includes(name)) return true;
    if (value.startsWith('eq.')) return String(row[name]) === value.slice(3);
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').map((item) => item.replace(/^"|"$/g, '')).includes(String(row[name]));
    return true;
  });
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (!path.includes('/rest/v1/') || path.includes('/rest/v1/rpc/')) return route.fulfill({ json: [] });
    const table = path.split('/').pop();
    const pk = primaryKey(table);
    store[table] ??= [];
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    if (method === 'GET' || method === 'HEAD') {
      const rows = store[table].filter((row) => matches(row, url.searchParams));
      const headers = { 'access-control-expose-headers': 'content-range', 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` };
      return route.fulfill({ json: wantsObject ? rows[0] ?? null : rows, headers });
    }
    const body = method === 'DELETE' ? undefined : request.postDataJSON();
    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const saved = list.map((item) => {
        const existing = store[table].find((row) => row[pk] === item[pk]);
        if (existing) return Object.assign(existing, item);
        const row = { ...item };
        store[table].push(row);
        return row;
      });
      return route.fulfill({ status: 201, json: wantsObject ? saved[0] : saved });
    }
    if (method === 'PATCH') {
      const rows = store[table].filter((row) => matches(row, url.searchParams));
      rows.forEach((row) => Object.assign(row, body));
      return route.fulfill({ json: wantsObject ? rows[0] ?? null : rows });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, store };
}

const seed = {
  payment_methods: [
    { key: 'paypal', type: 'paypal', name: 'PayPal', description: 'Card or PayPal', active: true, sort_order: 1 },
  ],
  reviews: [
    { id: 'r-1', name: 'Ana', country: 'CR', quote: 'Great day', quote_es: 'Gran dia', quote_en: 'Great day', translated: true, rating: 5, status: 'approved', featured: false, active: true, sort_order: 1, image_url: null, image_public_id: null, created_at: '2026-01-02T00:00:00Z' },
  ],
  departure_locations: [
    { id: 'd-1', name: 'Playas del Coco', description: 'Main dock', description_en: 'Main dock', description_es: 'Muelle principal', active: true, sort_order: 1, additional_charge: 0, is_default: false },
  ],
  gallery_images: [
    { id: 'g-1', title: 'One', alt: 'Alt one', category: 'fishing', image_url: '', active: true, sort_order: 1 },
  ],
};

const PAGES = [
  '/admin', '/admin/reservations', '/admin/tours', '/admin/boats', '/admin/boat-tours', '/admin/departure-locations',
  '/admin/payment-methods', '/admin/portada', '/admin/sobre-nosotros', '/admin/gallery', '/admin/reviews',
];

// Roles that must always have an accessible name. In an ARIA snapshot a nameless control is a bare `- button` line.
const NAMED_ROLES = ['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'spinbutton', 'switch', 'searchbox', 'slider'];
const unnamedControls = (snapshot) => snapshot.split('\n')
  .map((line) => line.trim())
  .filter((line) => new RegExp(`^- (${NAMED_ROLES.join('|')})(\\s*(\\[[^\\]]*\\])*\\s*:?\\s*$|\\s*\\[[^\\]]*\\]\\s*$)`).test(line) && !/"/.test(line));

// Presses Tab (skipping any stops before `scope` is entered) and records where every stop inside `scope` is on
// screen, until focus leaves the scope or completes a full cycle (a focus trap wraps back to its first stop).
async function tabStops(page, { scope = 'body', max = 80 } = {}) {
  const stops = [];
  let entered = false;
  await page.evaluate(() => document.querySelectorAll('[data-a11y-seen]').forEach((el) => el.removeAttribute('data-a11y-seen')));
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate((selector) => {
      const el = document.activeElement;
      const root = document.querySelector(selector);
      if (!el || el === document.body || !root) return null;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      // Page coordinates: viewport position plus every scrolled ancestor (the admin content scrolls inside <main>, not the window).
      let scrollTop = 0; let scrollLeft = 0;
      for (let node = el.parentElement; node; node = node.parentElement) { scrollTop += node.scrollTop; scrollLeft += node.scrollLeft; }
      const seen = el.hasAttribute('data-a11y-seen');
      el.setAttribute('data-a11y-seen', '1');
      return {
        seen,
        inside: root.contains(el),
        tag: el.tagName.toLowerCase(),
        name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40) || el.getAttribute('placeholder') || el.id || el.className.toString().slice(0, 30),
        top: Math.round(box.top + scrollTop), left: Math.round(box.left + scrollLeft), height: Math.round(box.height),
        visibleFocus: (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || Boolean(style.boxShadow && style.boxShadow !== 'none'),
        tabindex: el.getAttribute('tabindex'),
      };
    }, scope);
    if (!stop) { if (entered) break; continue; }
    if (!stop.inside) { if (entered) break; continue; }
    entered = true;
    if (stop.seen) break; // wrapped: a focus trap sends the last stop back to the first
    stops.push(stop);
  }
  return stops;
}

// Reading order: a stop may move down, or right along the same row, or jump back up only to the next column of a
// card grid (each card is read as a unit). It never goes back up within the same/left column, and never left on a row.
function readingOrderViolations(stops, tolerance = 12) {
  const bad = [];
  for (let i = 1; i < stops.length; i += 1) {
    const prev = stops[i - 1];
    const next = stops[i];
    const sameRow = Math.abs(next.top - prev.top) <= tolerance;
    const describe = (direction) => `${prev.name} (${prev.top},${prev.left}) -> ${next.name} (${next.top},${next.left}) goes ${direction}`;
    if (next.top < prev.top - tolerance && next.left <= prev.left + tolerance) bad.push(describe('up'));
    else if (sameRow && next.left < prev.left - tolerance) bad.push(describe('left'));
  }
  return bad;
}

test('every Admin screen: all controls have an accessible name and no tabindex is positive', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    for (const path of PAGES) {
      await page.goto(`${base}${path}`);
      await page.waitForTimeout(700);
      const snapshot = await page.locator('body').ariaSnapshot();
      assert.deepEqual(unnamedControls(snapshot), [], `${path}: controls without an accessible name`);
      const positive = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0).length);
      assert.equal(positive, 0, `${path}: positive tabindex`);
    }
  } finally { await f.browser.close(); }
});

test('every Admin screen: Tab follows the reading order and every stop shows a visible focus indicator', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    for (const path of PAGES) {
      await page.goto(`${base}${path}`);
      await page.waitForTimeout(700);
      await page.locator('main, .admin-main, body').first().evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
      // Start inside the page content (the sidebar / topbar chrome is audited by its own test).
      const stops = await tabStops(page, { scope: 'main', max: 60 });
      assert.ok(stops.length >= 2, `${path}: no keyboard stops in the main content`);
      const invisible = stops.filter((stop) => !stop.visibleFocus).map((stop) => `${stop.tag} ${stop.name}`);
      assert.deepEqual(invisible, [], `${path}: stops without a visible focus indicator`);
      assert.deepEqual(readingOrderViolations(stops), [], `${path}: Tab order differs from reading order`);
    }
  } finally { await f.browser.close(); }
});

test('shell: skip-free chrome is reachable in order — sidebar links, then the topbar, then the page — and Shift+Tab walks back', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    await page.goto(`${base}/admin/payment-methods`);
    await page.waitForTimeout(500);
    const regions = [];
    await page.evaluate(() => document.activeElement?.blur?.());
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const region = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'none';
        if (el.closest('#admin-sidebar')) return 'sidebar';
        if (el.closest('header')) return 'topbar';
        if (el.closest('main')) return 'main';
        return 'other';
      });
      if (regions.at(-1) !== region) regions.push(region);
      if (regions.length > 3 && regions[0] === region) break; // completed a full cycle
    }
    // The sidebar comes first in reading order, then the header and the page content; nothing interleaves.
    assert.deepEqual(regions.filter((region) => region !== 'none' && region !== 'other').slice(0, 3), ['sidebar', 'topbar', 'main'], `region order was ${regions}`);
    await page.keyboard.press('Shift+Tab');
    // Shift+Tab walks back over exactly the stop Tab just left.
    await page.evaluate(() => document.activeElement?.blur?.());
    const active = () => page.evaluate(() => { const el = document.activeElement; return el ? `${el.tagName}|${el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 30)}|${Math.round(el.getBoundingClientRect().top)}` : ''; });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const second = await active();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await active(), second, 'Shift+Tab returns to the previous stop');
  } finally { await f.browser.close(); }
});

// ---- Dialogs ------------------------------------------------------------------------------------------------------

async function assertDialogKeyboard(page, { name, opener }) {
  const trigger = typeof opener === 'function' ? await opener() : opener;
  const dialog = page.getByRole('dialog', name ? { name } : undefined).last();
  await expect(dialog).toBeVisible();
  // Focus is inside the dialog straight away and Tab / Shift+Tab never leave it.
  const inside = () => page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')].at(-1);
    return Boolean(dlg && dlg.contains(document.activeElement));
  });
  assert.equal(await inside(), true, `${name}: focus starts inside the dialog`);
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    assert.equal(await inside(), true, `${name}: Tab #${i + 1} stayed inside`);
  }
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Shift+Tab');
    assert.equal(await inside(), true, `${name}: Shift+Tab #${i + 1} stayed inside`);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  return trigger;
}

test('dialogs: create / edit / confirm dialogs trap focus, close on Escape and return focus to what opened them', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    // Departure locations: "Nuevo lugar" modal.
    await page.goto(`${base}/admin/departure-locations`);
    const newLocation = page.getByRole('button', { name: /Nuevo lugar/ });
    await newLocation.click();
    await assertDialogKeyboard(page, { name: undefined, opener: newLocation });
    await expect(newLocation).toBeFocused();

    // Reviews: the comment editor (visibility, featured and delete are managed inside it).
    await page.goto(`${base}/admin/reviews`);
    const del = page.getByRole('button', { name: 'Editar comentario de Ana' });
    await del.click();
    await assertDialogKeyboard(page, { name: undefined, opener: del });
    await expect(del).toBeFocused();

    // Gallery: editor modal.
    await page.goto(`${base}/admin/gallery`);
    const edit = page.getByRole('button', { name: /Editar imagen/ }).first();
    await edit.click();
    await assertDialogKeyboard(page, { name: undefined, opener: edit });
    await expect(edit).toBeFocused();

    // Reservations: manual booking modal.
    await page.goto(`${base}/admin/reservations`);
    const create = page.getByRole('button', { name: /Crear reserva/ }).first();
    await create.click();
    await assertDialogKeyboard(page, { name: undefined, opener: create });
    await expect(create).toBeFocused();
  } finally { await f.browser.close(); }
});

test('forms: the field order inside dialogs follows the reading order (departure location and manual booking)', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: /Nuevo lugar/ }).click();
    let stops = await tabStops(page, { scope: '[role="dialog"]', max: 25 });
    assert.ok(stops.length >= 4, 'departure location form has focusable fields');
    assert.deepEqual(readingOrderViolations(stops), [], 'departure location form');
    await page.keyboard.press('Escape');

    await page.goto(`${base}/admin/reservations`);
    await page.getByRole('button', { name: /Crear reserva/ }).first().click();
    stops = await tabStops(page, { scope: '[role="dialog"]', max: 40 });
    assert.ok(stops.length >= 4, 'manual booking form has focusable fields');
    assert.deepEqual(readingOrderViolations(stops), [], 'manual booking form');
  } finally { await f.browser.close(); }
});

test('selects and inputs inside the filter panels are labelled and reachable by keyboard', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    for (const path of ['/admin/reservations', '/admin/tours', '/admin/boats', '/admin/boat-tours', '/admin/departure-locations', '/admin/gallery', '/admin/reviews', '/admin/payment-methods']) {
      await page.goto(`${base}${path}`);
      const trigger = page.locator('.admin-toolbar .admin-filter-trigger');
      await trigger.focus();
      await page.keyboard.press('Enter');
      const panel = page.locator('.admin-filter-panel');
      await expect(panel, path).toBeVisible();
      const unlabelled = await panel.locator('select, input, textarea').evaluateAll((els) => els.filter((el) => !(el.getAttribute('aria-label') || el.labels?.length)).length);
      assert.equal(unlabelled, 0, `${path}: unlabelled filter controls`);
      const inPanel = () => page.evaluate(() => document.querySelector('.admin-filter-panel')?.contains(document.activeElement) ?? false);
      assert.equal(await inPanel(), true, `${path}: focus moves into the panel when it opens`);
      await page.keyboard.press('Escape');
      await expect(panel, path).toHaveCount(0);
      await expect(trigger, path).toBeFocused();
    }
  } finally { await f.browser.close(); }
});

test('mobile: the same keyboard rules hold on a phone-width viewport (drawer navigation, filter panel, Escape)', async () => {
  const f = await fixture(seed, { width: 390, height: 800 }); const { page } = f;
  try {
    await page.goto(`${base}/admin/payment-methods`);
    const menu = page.getByRole('button', { name: /menu/i }).first();
    await expect(menu).toBeVisible();
    const positive = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0).length);
    assert.equal(positive, 0);
    const trigger = page.locator('.admin-toolbar .admin-filter-trigger');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.admin-filter-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    const snapshot = await page.locator('body').ariaSnapshot();
    assert.deepEqual(unnamedControls(snapshot), []);
  } finally { await f.browser.close(); }
});

test('wizards and editors: every control in the open dialog is named, Tab follows the reading order and Escape closes', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    const cases = [
      { path: '/admin/tours', open: /Crear tour/, label: 'tour wizard' },
      { path: '/admin/boats', open: /Crear bote/, label: 'boat wizard' },
      { path: '/admin/departure-locations', open: /Nuevo lugar/, label: 'departure location' },
      { path: '/admin/gallery', open: /Nueva imagen|Editar imagen/, label: 'gallery editor' },
      { path: '/admin/reservations', open: /Crear reserva/, label: 'manual booking' },
    ];
    for (const { path, open, label } of cases) {
      await page.goto(`${base}${path}`);
      const trigger = page.getByRole('button', { name: open }).first();
      await trigger.click();
      const dialog = page.getByRole('dialog').last();
      await expect(dialog, label).toBeVisible();
      assert.deepEqual(unnamedControls(await dialog.ariaSnapshot()), [], `${label}: controls without an accessible name`);
      const stops = await tabStops(page, { scope: '[role="dialog"]', max: 40 });
      assert.ok(stops.length >= 3, `${label}: keyboard stops`);
      assert.deepEqual(stops.filter((stop) => !stop.visibleFocus).map((stop) => stop.name), [], `${label}: focus indicator`);
      assert.deepEqual(readingOrderViolations(stops), [], `${label}: Tab order`);
      assert.equal(stops.filter((stop) => Number(stop.tabindex) > 0).length, 0, `${label}: positive tabindex`);
      await page.keyboard.press('Escape');
      // A wizard with typed changes would ask before discarding; these are untouched, so Escape closes.
      await expect(page.getByRole('dialog'), label).toHaveCount(0);
    }
  } finally { await f.browser.close(); }
});
