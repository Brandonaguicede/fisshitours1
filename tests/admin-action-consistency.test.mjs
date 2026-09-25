// Global action consistency (block I): funnel-only filters, icon-only reorder, primary action before secondary
// (DOM order = visual order), the Eye / EyeOff convention and no positive tabindex.
// Same in-memory PostgREST pattern as the other admin tests: no real Supabase project.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const primaryKey = (table) => (table === 'site_settings' || table === 'payment_methods' ? 'key' : 'id');

async function fixture(seed = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  const store = Object.fromEntries(Object.entries(seed).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
  const writes = [];
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
    writes.push({ table, method, body, filters: Object.fromEntries(url.searchParams.entries()) });
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
    if (method === 'DELETE') {
      const rows = store[table].filter((row) => matches(row, url.searchParams));
      store[table] = store[table].filter((row) => !rows.includes(row));
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, writes, store };
}

const LIST_PAGES = [
  { path: '/admin/reservations' },
  { path: '/admin/tours' },
  { path: '/admin/boats' },
  { path: '/admin/boat-tours' },
  { path: '/admin/departure-locations' },
  { path: '/admin/gallery' },
  { path: '/admin/reviews' },
  { path: '/admin/payment-methods' },
];

const seed = {
  payment_methods: [
    { key: 'paypal', type: 'paypal', name: 'PayPal', description: 'Card or PayPal', active: true, sort_order: 1 },
    { key: 'cash', type: 'pay_on_day', name: 'Cash on the day', description: 'Pay at the dock', active: false, sort_order: 2 },
  ],
  reviews: [
    { id: 'r-1', name: 'Ana', country: 'CR', quote: 'Great day', quote_es: 'Gran dia', quote_en: 'Great day', translated: true, rating: 5, status: 'approved', featured: false, active: true, sort_order: 1, image_url: null, image_public_id: null, created_at: '2026-01-02T00:00:00Z' },
    { id: 'r-2', name: 'Ben', country: 'US', quote: 'Nice trip', quote_es: 'Buen viaje', quote_en: 'Nice trip', translated: true, rating: 4, status: 'approved', featured: false, active: false, sort_order: 2, image_url: null, image_public_id: null, created_at: '2026-01-01T00:00:00Z' },
  ],
  departure_locations: [
    { id: 'd-1', name: 'Playas del Coco', description: 'Main dock', description_en: 'Main dock', description_es: 'Muelle principal', active: true, sort_order: 1, additional_charge: 0, is_default: false },
    { id: 'd-2', name: 'Hermosa', description: 'North', description_en: 'North', description_es: 'Norte', active: true, sort_order: 2, additional_charge: 10, is_default: false },
  ],
  gallery_images: [
    { id: 'g-1', title: 'One', alt: 'Alt one', category: 'fishing', image_url: '', active: true, sort_order: 1 },
    { id: 'g-2', title: 'Two', alt: 'Alt two', category: 'fishing', image_url: '', active: false, sort_order: 2 },
  ],
};

// Focusable controls of the first toolbar on the page, in DOM (= Tab) order, classified by role.
const toolbarKinds = (page) => page.evaluate(() => {
  const bar = document.querySelector('.admin-toolbar');
  return [...bar.querySelectorAll('input, button, a[href], select')].map((el) => (
    el.matches('input') ? 'search'
      : el.classList.contains('admin-filter-trigger') ? 'filter'
        : el.classList.contains('admin-icon-btn') ? 'icon'
          : el.classList.contains('admin-btn--secondary') ? 'secondary' : 'primary'
  ));
});

test('filters: every admin list has a funnel-only trigger — no visible button border, named, big enough, focus visible', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    for (const { path } of LIST_PAGES) {
      await page.goto(`${base}${path}`);
      const trigger = page.locator('.admin-toolbar .admin-filter-trigger');
      await expect(trigger, path).toBeVisible();
      await expect(trigger, path).toHaveAttribute('aria-label', /^Filtros/);
      await expect(trigger, path).toHaveAttribute('title', 'Filtros');
      const info = await trigger.evaluate((el) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return { text: el.textContent.trim(), funnel: Boolean(el.querySelector('svg.lucide-filter')), borderColor: style.borderTopColor, background: style.backgroundColor, width: box.width, height: box.height };
      });
      assert.equal(info.text, '', `${path}: the trigger shows no text`);
      assert.equal(info.funnel, true, `${path}: the trigger is a funnel`);
      assert.equal(info.borderColor, 'rgba(0, 0, 0, 0)', `${path}: no visible border`);
      assert.equal(info.background, 'rgba(0, 0, 0, 0)', `${path}: no button background`);
      assert.ok(info.width >= 40 && info.height >= 40, `${path}: hit target is ${info.width}x${info.height}`);
      // Reached by keyboard straight after the search box, with a visible focus ring.
      await page.locator('.admin-toolbar .admin-search-field input').focus();
      await page.keyboard.press('Tab');
      await expect(trigger, path).toBeFocused();
      assert.notEqual(await trigger.evaluate((el) => getComputedStyle(el).outlineStyle), 'none', `${path}: focus ring`);
    }
  } finally { await f.browser.close(); }
});

test('filters: the active count is announced and shown, and Escape closes the panel back onto the trigger', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    await page.goto(`${base}/admin/payment-methods`);
    const trigger = page.locator('.admin-toolbar .admin-filter-trigger');
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Filtros de metodos de pago' });
    await expect(panel).toBeVisible();
    await panel.getByRole('combobox').selectOption('active');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-label', 'Filtros (1 activos)');
    await expect(trigger.locator('.admin-badge')).toHaveText('1');
  } finally { await f.browser.close(); }
});

test('toolbars: search, filters, then the primary action, then secondary ones — same in the DOM (Tab) order', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    for (const { path } of LIST_PAGES) {
      await page.goto(`${base}${path}`);
      await expect(page.locator('.admin-toolbar .admin-filter-trigger'), path).toBeVisible();
      const kinds = await toolbarKinds(page);
      assert.equal(kinds[0], 'search', `${path}: ${kinds}`);
      assert.equal(kinds[1], 'filter', `${path}: ${kinds}`);
      const firstSecondary = kinds.findIndex((kind) => kind === 'secondary' || kind === 'icon');
      const lastPrimary = kinds.lastIndexOf('primary');
      if (firstSecondary !== -1 && lastPrimary !== -1) assert.ok(lastPrimary < firstSecondary, `${path}: primary must precede secondary (${kinds})`);
    }
  } finally { await f.browser.close(); }
});

test('reorder: the entry point is an icon-only Reordenar; while reordering, Guardar orden (primary) comes before Cancelar', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    for (const path of ['/admin/departure-locations', '/admin/reviews', '/admin/gallery']) {
      await page.goto(`${base}${path}`);
      const reorder = page.getByRole('button', { name: 'Reordenar', exact: true });
      await expect(reorder, path).toBeVisible();
      await expect(reorder, path).toHaveAttribute('title', 'Reordenar');
      const info = await reorder.evaluate((el) => ({ text: el.textContent.trim(), borderColor: getComputedStyle(el).borderTopColor, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
      assert.equal(info.text, '', `${path}: icon only`);
      assert.equal(info.borderColor, 'rgba(0, 0, 0, 0)', `${path}: no visible border`);
      assert.ok(info.width >= 40 && info.height >= 40, `${path}: hit target`);
      await reorder.focus();
      await page.keyboard.press('Tab'); // keyboard modality, so :focus-visible applies when we come back
      await page.keyboard.press('Shift+Tab');
      assert.notEqual(await reorder.evaluate((el) => getComputedStyle(el).outlineStyle), 'none', `${path}: focus ring`);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Guardar orden', exact: true }), path).toBeVisible();
      const order = await page.evaluate(() => [...document.querySelectorAll('.admin-toolbar button')].map((el) => el.textContent.trim()).filter((text) => ['Guardar orden', 'Cancelar'].includes(text)));
      assert.deepEqual(order, ['Guardar orden', 'Cancelar'], path);
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(reorder, path).toBeVisible();
    }
  } finally { await f.browser.close(); }
});

// ---- Eye / EyeOff: the icon is always the action that will happen (Mostrar -> Eye, Ocultar -> EyeOff) -----------------

const iconOf = (locator) => locator.evaluate((el) => (el.querySelector('svg.lucide-eye-off') ? 'eye-off' : el.querySelector('svg.lucide-eye') ? 'eye' : 'none'));

test('Eye / EyeOff: payment methods — an active method offers Desactivar with EyeOff, an inactive one Activar with Eye', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    await page.goto(`${base}/admin/payment-methods`);
    assert.equal(await iconOf(page.getByRole('button', { name: 'Desactivar PayPal' })), 'eye-off');
    assert.equal(await iconOf(page.getByRole('button', { name: 'Activar Cash on the day' })), 'eye');
  } finally { await f.browser.close(); }
});

test('Eye / EyeOff: comments — a visible comment offers Ocultar with EyeOff, a hidden one Mostrar with Eye', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    await page.goto(`${base}/admin/reviews`);
    assert.equal(await iconOf(page.getByRole('button', { name: 'Ocultar comentario de Ana' })), 'eye-off');
    assert.equal(await iconOf(page.getByRole('button', { name: 'Mostrar comentario de Ben' })), 'eye');
  } finally { await f.browser.close(); }
});

test('Eye / EyeOff: gallery cards state Visible / Oculta as text (no eye icon that could read as an action); the editor button follows the convention', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    await page.goto(`${base}/admin/gallery`);
    const cards = page.locator('.admin-media-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).locator('.admin-badge')).toHaveText('Visible');
    await expect(cards.nth(1).locator('.admin-badge')).toHaveText('Oculta');
    await expect(cards.locator('svg.lucide-eye, svg.lucide-eye-off')).toHaveCount(0);
    await cards.nth(0).getByRole('button', { name: /Editar imagen/ }).click();
    assert.equal(await iconOf(page.getByRole('button', { name: 'Ocultar imagen' })), 'eye-off');
    await page.getByRole('button', { name: 'Ocultar imagen' }).click();
    assert.equal(await iconOf(page.getByRole('button', { name: 'Mostrar imagen' })), 'eye');
  } finally { await f.browser.close(); }
});

// ---- Confirmation dialogs: the confirming action first, Escape closes, no positive tabindex -----------------------

test('confirm dialog: the confirming button precedes Cancelar in the DOM and Escape dismisses without acting', async () => {
  const f = await fixture(seed); const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/reviews`);
    await page.getByRole('button', { name: 'Eliminar comentario de Ana' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const names = await dialog.locator('button').evaluateAll((els) => els.map((el) => el.textContent.trim()));
    assert.deepEqual(names, ['Eliminar', 'Cancelar']);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    assert.equal(writes.filter((w) => w.method === 'DELETE').length, 0, 'Escape never deletes');
  } finally { await f.browser.close(); }
});

test('no admin screen uses a positive tabindex', async () => {
  const f = await fixture(seed); const { page } = f;
  try {
    for (const { path } of [...LIST_PAGES, { path: '/admin' }, { path: '/admin/portada' }, { path: '/admin/sobre-nosotros' }]) {
      await page.goto(`${base}${path}`);
      await page.waitForTimeout(500);
      const bad = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0).length);
      assert.equal(bad, 0, path);
    }
  } finally { await f.browser.close(); }
});
