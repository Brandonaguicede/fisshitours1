// Admin refinement round: the single Download menu, one Spanish status vocabulary (badges), the sidebar's collapse control at the
// bottom, Eye = active/visible (also on the login password field), and the "primary action first" rule (DOM order = visual order)
// on toolbars, dialogs, filter panel and row actions. Same in-memory PostgREST pattern as the other admin tests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const primaryKey = (table) => (table === 'site_settings' || table === 'payment_methods' ? 'key' : 'id');

const reservationRows = [
  ['b-1', 'confirmed', 'paid', 'paypal'],
  ['b-2', 'pending_payment', 'pending', 'whatsapp-link'],
  ['b-3', 'cancelled', 'failed', 'paypal'],
  ['b-4', 'pending_confirmation', 'not_required_yet', 'pay-on-day'],
].map(([id, booking_status, payment_status, payment_method_key], i) => ({
  id, booking_reference: `PFT-${String(i + 1).padStart(4, '0')}`, boat_id: 'boat-1', tour_id: 'tour-1', tour_package_id: 'pkg-1', time_slot_id: 'slot-1', tour_date: `2026-10-0${i + 1}`,
  created_at: '2026-09-20T14:30:00Z', guests: 2, total_snapshot: 350 + i, departure_location_name_snapshot: 'Marina', departure_surcharge_snapshot: 0,
  payment_method_key, payment_status, booking_status, special_requests: '',
  customers: { full_name: `Cliente ${i + 1}`, email: `c${i + 1}@example.com`, whatsapp: '+506 8888 0000' }, boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' }, time_slots: { label: '7:00 AM' },
}));

const seed = {
  payment_methods: [
    { key: 'paypal', type: 'paypal', name: 'PayPal', description: 'Card or PayPal', active: true, sort_order: 1 },
    { key: 'cash', type: 'pay_on_day', name: 'Cash on the day', description: 'Pay at the dock', active: false, sort_order: 2 },
  ],
  reviews: [
    { id: 'r-1', name: 'Ana', country: 'CR', quote: 'Great day', quote_es: 'Gran dia', quote_en: 'Great day', translated: true, rating: 5, status: 'approved', featured: false, active: true, sort_order: 1, image_url: null, image_public_id: null, created_at: '2026-01-03T00:00:00Z' },
    { id: 'r-2', name: 'Ben', country: 'US', quote: 'Nice trip', quote_es: 'Buen viaje', quote_en: 'Nice trip', translated: true, rating: 4, status: 'pending', featured: false, active: false, sort_order: 2, image_url: null, image_public_id: null, created_at: '2026-01-02T00:00:00Z' },
    { id: 'r-3', name: 'Cy', country: 'MX', quote: 'Not for us', quote_es: 'No', quote_en: 'Not for us', translated: true, rating: 2, status: 'rejected', featured: false, active: false, sort_order: 3, image_url: null, image_public_id: null, created_at: '2026-01-01T00:00:00Z' },
  ],
  departure_locations: [
    { id: 'd-1', name: 'Playas del Coco', description: 'Main dock', description_en: 'Main dock', description_es: 'Muelle principal', active: true, sort_order: 1, surcharge_amount: 0, currency: 'USD', is_default: false },
    { id: 'd-2', name: 'Hermosa', description: 'North', description_en: 'North', description_es: 'Norte', active: false, sort_order: 2, surcharge_amount: 10, currency: 'USD', is_default: false },
  ],
  gallery_images: [
    { id: 'g-1', title: 'One', alt: 'Alt one', category: 'fishing', image_url: '', active: true, sort_order: 1 },
    { id: 'g-2', title: 'Two', alt: 'Alt two', category: 'fishing', image_url: '', active: false, sort_order: 2 },
  ],
};

async function fixture(viewport = { width: 1366, height: 1000 }, { login = true } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport });
  const store = Object.fromEntries(Object.entries(seed).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
  const matches = (row, params) => [...params.entries()].every(([name, value]) => {
    if (['select', 'order', 'limit', 'offset', 'or', 'columns', 'on_conflict'].includes(name)) return true;
    if (value.startsWith('eq.')) return String(row[name]) === value.slice(3);
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
    if (path.endsWith('/rpc/list_admin_bookings')) return route.fulfill({ json: { rows: reservationRows, total: reservationRows.length } });
    if (!path.includes('/rest/v1/') || path.includes('/rest/v1/rpc/')) return route.fulfill({ json: [] });
    const table = path.split('/').pop();
    store[table] ??= [];
    if (method === 'GET' || method === 'HEAD') {
      const rows = store[table].filter((row) => matches(row, url.searchParams));
      const headers = { 'access-control-expose-headers': 'content-range', 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` };
      return route.fulfill({ json: rows, headers });
    }
    return route.fulfill({ json: [] });
  });
  if (login) {
    await page.goto(`${base}/admin/login`);
    await page.getByPlaceholder('admin@example.com').fill(user.email);
    await page.getByPlaceholder('Password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();
    await expect(page.getByText('Reservas totales')).toBeVisible();
  }
  return { browser, page };
}

const setTheme = (page, theme) => page.evaluate((value) => { window.localStorage.setItem('pft-admin-theme', value); document.documentElement.setAttribute('data-theme', value); }, theme);

// ---- Download: ONE icon-only trigger + a compact menu -------------------------------------------------------------------

test('Reservas: one icon-only Descargar control (no big Excel/PDF buttons) that opens a menu with Excel (.xlsx) and PDF (.pdf)', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    await expect(page.locator('.admin-reservations-table tbody tr')).toHaveCount(4);
    await expect(page.getByRole('button', { name: /Descargar (Excel|PDF)/ })).toHaveCount(0);
    const trigger = page.getByRole('button', { name: 'Descargar', exact: true });
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toHaveAttribute('title', 'Descargar');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const box = await trigger.evaluate((el) => ({ text: el.textContent.trim(), svg: el.querySelectorAll('svg.lucide-download').length, border: getComputedStyle(el).borderTopColor, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
    assert.deepEqual([box.text, box.svg, box.border], ['', 1, 'rgba(0, 0, 0, 0)'], 'icon only, no visible border');
    assert.ok(box.w >= 40 && box.w <= 48 && box.h >= 40 && box.h <= 48, `compact square target (${box.w}x${box.h})`);
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByRole('menu', { name: 'Descargar' });
    await expect(menu).toBeVisible();
    const items = menu.getByRole('menuitem');
    await expect(items).toHaveText(['Excel (.xlsx)', 'PDF (.pdf)']);
    await expect(items.locator('svg')).toHaveCount(2); // one icon per format
    await expect(items.first()).toBeFocused();
  } finally { await f.browser.close(); }
});

test('Download menu keyboard and dismissal: arrows / Home / End move, Escape and outside click close, Tab leaves, focus returns to the trigger', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    const trigger = page.getByRole('button', { name: 'Descargar', exact: true });
    const menu = page.getByRole('menu', { name: 'Descargar' });
    const items = menu.getByRole('menuitem');
    // ArrowDown on the trigger opens it and focuses the first option.
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.first()).toBeFocused(); // wraps
    await page.keyboard.press('End');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(items.first()).toBeFocused();
    assert.notEqual(await items.first().evaluate((el) => getComputedStyle(el).outlineStyle), 'none', 'visible focus on the option');
    // Escape closes and returns focus to the trigger.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Outside click closes.
    await trigger.click();
    await expect(menu).toBeVisible();
    await page.locator('.admin-page-header, .admin-stat-grid').first().click({ position: { x: 5, y: 5 } });
    await expect(menu).toHaveCount(0);
    // Tab closes and moves on.
    await trigger.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex^="-"])').length), 0, 'no positive tabindex');
  } finally { await f.browser.close(); }
});

test('Download menu: choosing an option closes it and runs the real export (XLSX and PDF downloads keep working)', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    await expect(page.locator('.admin-reservations-table tbody tr')).toHaveCount(4);
    const trigger = page.getByRole('button', { name: 'Descargar', exact: true });
    for (const [option, extension] of [['Excel (.xlsx)', 'xlsx'], ['PDF (.pdf)', 'pdf']]) {
      await trigger.click();
      const pending = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: option }).click();
      await expect(page.getByRole('menu', { name: 'Descargar' })).toHaveCount(0);
      const file = await pending;
      assert.match(file.suggestedFilename(), new RegExp(`^reservas-\\d{4}-\\d{2}-\\d{2}\\.${extension}$`));
      const bytes = await fs.readFile(await file.path());
      assert.equal(bytes.subarray(0, extension === 'pdf' ? 5 : 2).toString('latin1'), extension === 'pdf' ? '%PDF-' : 'PK');
      await expect(trigger).toBeFocused();
    }
  } finally { await f.browser.close(); }
});

test('Download menu looks right in light and dark and stays inside a phone viewport', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    const trigger = page.getByRole('button', { name: 'Descargar', exact: true });
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await trigger.click();
      const panel = page.getByRole('menu', { name: 'Descargar' });
      await expect(panel).toBeVisible();
      const style = await panel.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, shadow: s.boxShadow, border: s.borderTopWidth }; });
      assert.notEqual(style.shadow, 'none', `${theme}: elevated popover`);
      assert.equal(style.border, '1px', `${theme}: bordered popover`);
      if (theme === 'dark') assert.notEqual(style.bg, 'rgb(255, 255, 255)', 'dark surface, not a white box');
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    const rect = await page.getByRole('menu', { name: 'Descargar' }).evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right }; });
    assert.ok(rect.l >= 0 && rect.r <= 390, `menu inside the phone viewport (${rect.l}..${rect.r})`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await f.browser.close(); }
});

test('Resumen de paquetes uses the same download pattern (single icon, menu with PDF)', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/boat-tours`);
    await expect(page.getByRole('button', { name: 'Descargar PDF' })).toHaveCount(0);
    const trigger = page.getByRole('button', { name: 'Descargar', exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole('menu', { name: 'Descargar' }).getByRole('menuitem')).toHaveText(['PDF (.pdf)']);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  } finally { await f.browser.close(); }
});

// ---- Status badges: one Spanish vocabulary, one look ---------------------------------------------------------------------

const ENGLISH_STATUS = /^(active|inactive|pending|approved|rejected|paid|failed|confirmed|cancelled|completed|processing|refunded|draft|published|hidden)$/i; // ("Visible" is the same word in Spanish)

test('badges: every status on every list is Spanish (never active / pending / approved…) and the same state always looks the same', async () => {
  const f = await fixture(); const { page } = f;
  try {
    const seen = {};
    for (const path of ['/admin/reservations', '/admin/payment-methods', '/admin/departure-locations', '/admin/reviews', '/admin/gallery', '/admin/boat-tours', '/admin']) {
      await page.goto(`${base}${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(700);
      const badges = await page.locator('.admin-badge').evaluateAll((nodes) => nodes.map((node) => {
        const s = getComputedStyle(node);
        return { text: node.textContent.trim(), tone: [...node.classList].find((name) => name.startsWith('admin-badge--')), look: [s.backgroundColor, s.color, s.borderRadius, s.fontSize, s.fontWeight, s.paddingTop, s.paddingLeft].join('|') };
      }));
      for (const badge of badges) {
        assert.doesNotMatch(badge.text, ENGLISH_STATUS, `${path}: raw/English status "${badge.text}"`);
        if (!badge.text) continue;
        // Same text = same tone (and, outside the compact Dashboard card, the same treatment).
        const key = `${badge.text}`;
        seen[key] ??= { tone: badge.tone, looks: new Set() };
        assert.equal(seen[key].tone, badge.tone, `${path}: "${badge.text}" keeps one tone`);
        seen[key].looks.add(badge.look); // includes the Dashboard card and the payment cell: one size everywhere
      }
    }
    for (const [text, info] of Object.entries(seen)) assert.ok(info.looks.size <= 1, `"${text}" has ${info.looks.size} different looks`);
    // The vocabulary actually rendered.
    for (const text of ['Activo', 'Inactivo', 'Pendiente', 'Aprobado', 'Rechazado', 'Pagado', 'Confirmada', 'Cancelada', 'Visible', 'Oculta']) assert.ok(seen[text], `expected the "${text}" badge somewhere`);
    // A given state has one tone: active/visible/paid/approved green, inactive/hidden neutral, cancelled/rejected red, pending amber.
    assert.equal(seen.Activo.tone, 'admin-badge--success');
    assert.equal(seen.Inactivo.tone, 'admin-badge--neutral');
    assert.equal(seen.Pendiente.tone, 'admin-badge--warning');
    assert.equal(seen.Aprobado.tone, 'admin-badge--success');
    assert.equal(seen.Rechazado.tone, 'admin-badge--danger');
  } finally { await f.browser.close(); }
});

test('badges: the shared vocabulary maps stored values to Spanish without renaming anything, and unknown values are humanized', async () => {
  const f = await fixture(); const { page } = f;
  try {
    const result = await page.evaluate(async () => {
      const { adminStatusLabel, ADMIN_STATUS_BADGES } = await import('/src/components/admin/AdminPrimitives.tsx');
      return {
        labels: Object.fromEntries(['active', 'inactive', 'pending', 'approved', 'rejected', 'visible', 'hidden', 'hidden_f', 'true', 'false', 'pending_payment', 'not_required_yet'].map((key) => [key, adminStatusLabel(key)])),
        boolean: [adminStatusLabel(true), adminStatusLabel(false)],
        unknown: adminStatusLabel('some_new_state'),
        keys: Object.keys(ADMIN_STATUS_BADGES).length,
      };
    });
    assert.deepEqual(result.labels, { active: 'Activo', inactive: 'Inactivo', pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', visible: 'Visible', hidden: 'Oculto', hidden_f: 'Oculta', true: 'Activo', false: 'Inactivo', pending_payment: 'Pago pendiente', not_required_yet: 'Pago en tour' });
    assert.deepEqual(result.boolean, ['Activo', 'Inactivo']);
    assert.equal(result.unknown, 'Some new state');
  } finally { await f.browser.close(); }
});

// ---- Sidebar: the collapse control lives at the bottom ------------------------------------------------------------------

test('sidebar: the collapse control is anchored at the bottom (not under the logo), keeps working, and stays reachable by keyboard', async () => {
  const f = await fixture(); const { page } = f;
  try {
    const toggle = page.locator('#admin-sidebar').getByRole('button', { name: 'Colapsar menu' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAttribute('title', 'Colapsar menu');
    await expect(page.locator('.admin-sidebar__header').getByRole('button')).toHaveCount(0);
    const geometry = () => page.evaluate(() => {
      const sidebar = document.querySelector('#admin-sidebar').getBoundingClientRect();
      const toggleRect = document.querySelector('.admin-sidebar__toggle').getBoundingClientRect();
      const brand = document.querySelector('.admin-sidebar__brand').getBoundingClientRect();
      const lastLink = [...document.querySelectorAll('.admin-sidebar__link')].at(-1).getBoundingClientRect();
      return { sidebarBottom: sidebar.bottom, toggleTop: toggleRect.top, toggleBottom: toggleRect.bottom, brandBottom: brand.bottom, lastLinkBottom: lastLink.bottom, inFooter: Boolean(document.querySelector('.admin-sidebar__toggle').closest('.admin-sidebar__footer')), width: sidebar.width };
    });
    let g = await geometry();
    assert.equal(g.inFooter, true);
    assert.ok(g.toggleTop > g.brandBottom + 100, 'far below the logo');
    assert.ok(g.toggleTop >= g.lastLinkBottom, 'after the last navigation link');
    assert.ok(g.sidebarBottom - g.toggleBottom <= 24, `anchored to the bottom of the sidebar (${g.sidebarBottom - g.toggleBottom}px above it)`);
    // Keyboard: it is the LAST stop of the sidebar; Enter collapses, and it stays at the bottom.
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#admin-sidebar').getByRole('button', { name: 'Expandir menu' })).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(400);
    g = await geometry();
    assert.ok(g.width < 100, `collapsed (${g.width}px)`);
    assert.ok(g.sidebarBottom - g.toggleBottom <= 24, 'still at the bottom when collapsed');
    const last = await page.evaluate(() => { const focusables = [...document.querySelectorAll('#admin-sidebar a[href], #admin-sidebar button')]; return focusables.at(-1).classList.contains('admin-sidebar__toggle'); });
    assert.equal(last, true, 'DOM order: the toggle comes after the navigation');
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      const style = await page.locator('.admin-sidebar__toggle').evaluate((el) => { const s = getComputedStyle(el); return { color: s.color, bg: s.backgroundColor }; });
      assert.notEqual(style.color, style.bg, `${theme}: legible against the navy sidebar`);
    }
  } finally { await f.browser.close(); }
});

test('sidebar on a phone: the drawer keeps its collapse control at the bottom and closes with it', async () => {
  const f = await fixture({ width: 390, height: 800 }); const { page } = f;
  try {
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    const toggle = page.locator('#admin-sidebar').getByRole('button', { name: /Colapsar menu|Expandir menu/ });
    await expect(toggle).toBeVisible();
    const rect = await page.evaluate(() => { const s = document.querySelector('#admin-sidebar').getBoundingClientRect(); const t = document.querySelector('.admin-sidebar__toggle').getBoundingClientRect(); return { sidebarBottom: s.bottom, toggleBottom: t.bottom, toggleRight: t.right, sidebarRight: s.right, viewport: innerHeight }; });
    assert.ok(rect.sidebarBottom - rect.toggleBottom <= 24, 'bottom of the drawer');
    assert.ok(rect.toggleBottom <= rect.viewport, 'inside the viewport');
    assert.ok(rect.toggleRight <= rect.sidebarRight, 'inside the drawer');
    await toggle.click();
    await expect(page.locator('#admin-sidebar')).toHaveAttribute('aria-hidden', 'true');
  } finally { await f.browser.close(); }
});

// ---- Sobre Nosotros / Portada copy --------------------------------------------------------------------------------------

test('Sobre Nosotros does not show the "write in English" instruction (the translation itself still runs); no repair card anywhere', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    await expect(page.locator('.admin-content-section')).toBeVisible();
    await expect(page.getByText('Escríbelos en inglés: el español se genera al guardar.')).toHaveCount(0);
    await expect(page.getByText(/Escríbelos en inglés/)).toHaveCount(0);
    await expect(page.getByText('Reparar traducciones antiguas')).toHaveCount(0);
    await page.goto(`${base}/admin/portada`);
    await expect(page.getByText('Reparar traducciones antiguas')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

// ---- Eye / EyeOff on the login field ------------------------------------------------------------------------------------

test('login password toggle follows the same convention: EyeOff while the password is hidden, Eye while it is visible', async () => {
  const f = await fixture(undefined, { login: false }); const { page } = f;
  try {
    await page.goto(`${base}/admin/login`);
    const field = page.getByPlaceholder('Password');
    const toggle = page.getByRole('button', { name: /contraseña/i });
    await expect(field).toHaveAttribute('type', 'password');
    await expect(toggle.locator('svg.lucide-eye-off')).toHaveCount(1);
    await toggle.click();
    await expect(field).toHaveAttribute('type', 'text');
    await expect(toggle.locator('svg.lucide-eye')).toHaveCount(1);
    await expect(toggle.locator('svg.lucide-eye-off')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

// ---- Primary action first: DOM order = visual order ---------------------------------------------------------------------

const positions = (locators) => Promise.all(locators.map((locator) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top }; })));

test('filter panel: Listo (primary) comes before Limpiar, in the DOM and visually', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/payment-methods`);
    await page.locator('.admin-toolbar .admin-filter-trigger').click();
    const names = await page.locator('.admin-filter-panel__actions button').evaluateAll((buttons) => buttons.map((b) => b.textContent.trim()));
    assert.deepEqual(names, ['Listo', 'Limpiar']);
    const [listo, limpiar] = await positions([page.getByRole('button', { name: 'Listo', exact: true }), page.getByRole('button', { name: 'Limpiar', exact: true })]);
    assert.ok(listo.left < limpiar.left, 'Listo is visually first');
  } finally { await f.browser.close(); }
});

test('reservation rows: Confirmar (the primary action) comes before the edit icon, in the DOM and visually', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    const row = page.getByRole('row').filter({ hasText: 'PFT-0002' });
    await expect(row.getByRole('button', { name: /Confirmar/ })).toBeVisible();
    const order = await row.locator('.admin-row-actions button').evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''));
    assert.match(order[0], /^Confirmar reserva/);
    assert.match(order.at(-1), /^Editar reserva/);
    const [confirmar, editar] = await positions([row.getByRole('button', { name: /Confirmar/ }), row.getByRole('button', { name: /Editar reserva/ })]);
    assert.ok(confirmar.left < editar.left, 'Confirmar is visually first');
  } finally { await f.browser.close(); }
});

test('dialogs and editors: every group puts the primary button before the secondary one (Departure, Gallery, confirm/cancel dialogs, manual booking)', async () => {
  const f = await fixture(); const { page } = f;
  try {
    const footerNames = (selector) => page.locator(`${selector} button`).evaluateAll((buttons) => buttons.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean));
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: /Nuevo lugar/ }).click();
    assert.deepEqual(await footerNames('.admin-modal-footer'), ['Guardar', 'Cancelar']);
    await page.keyboard.press('Escape');
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: /Editar imagen/ }).first().click();
    assert.deepEqual(await footerNames('.admin-modal-footer'), ['Guardar']);
    await page.keyboard.press('Escape');
    await page.goto(`${base}/admin/reviews`);
    await page.getByRole('button', { name: 'Editar comentario de Ana' }).click();
    await page.getByRole('button', { name: 'Eliminar comentario', exact: true }).click();
    assert.deepEqual(await page.locator('[role="dialog"]').last().locator('.admin-actions button').evaluateAll((nodes) => nodes.map((n) => n.textContent.trim())), ['Eliminar', 'Cancelar']);
    await page.keyboard.press('Escape');
    await page.goto(`${base}/admin/reservations`);
    await page.getByRole('button', { name: /Crear reserva/ }).first().click();
    assert.deepEqual((await footerNames('.admin-modal-footer')).slice(0, 2), ['Crear', 'Cancelar']);
  } finally { await f.browser.close(); }
});

test('phone toolbar: the search takes the first row; the second keeps the order primary, funnel, download (same DOM order as desktop)', async () => {
  const f = await fixture({ width: 390, height: 844 }); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    const primary = page.locator('.admin-toolbar > .admin-btn').first();
    await expect(primary).toHaveAttribute('aria-label', 'Crear reserva');
    await expect(primary).toHaveText('');
    const [s, p, t, d] = await Promise.all([page.locator('.admin-toolbar .admin-search-field input'), primary, page.locator('.admin-toolbar .admin-filter-trigger'), page.getByRole('button', { name: 'Descargar', exact: true })].map((l) => l.boundingBox()));
    assert.ok(s.y + s.height <= p.y + 1, 'the search sits above the second row');
    assert.ok(Math.abs((p.y + p.height / 2) - (t.y + t.height / 2)) <= 6 && Math.abs((t.y + t.height / 2) - (d.y + d.height / 2)) <= 6, 'primary, funnel and download share one row');
    assert.ok(p.x < t.x && t.x < d.x, 'left to right: primary, funnel, download');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(t.width >= 40 && d.width >= 40, 'touch targets stay at least 40px');
  } finally { await f.browser.close(); }
});

// A static guard so the rule keeps holding as screens are added: inside one group of buttons, a secondary/ghost button never
// comes right before a primary/danger one. (Directional wizard navigation is a separate, single "Anterior" icon.)
test('source guard: no group of admin buttons puts a secondary/ghost button immediately before a primary one', async () => {
  const files = [];
  for (const dir of ['src/pages/admin', 'src/components/admin']) for (const name of await fs.readdir(dir)) if (name.endsWith('.tsx')) files.push(`${dir}/${name}`);
  const offenders = [];
  for (const file of files) {
    const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/);
    let previous = null;
    lines.forEach((line, index) => {
      const match = /<button[^>]*className=(?:"|\{`)([^"`]*)/.exec(line);
      if (!match || !match[1].includes('admin-btn') || match[1].includes('icon')) return;
      const classes = match[1];
      const kind = /secondary|ghost/.test(classes) ? 'secondary' : /danger/.test(classes) ? 'danger' : 'primary';
      // "Anterior" is the wizard's directional Back icon, allowed to precede the actions group.
      const directional = /aria-label="Anterior"/.test(line);
      if (previous && previous.kind === 'secondary' && !previous.directional && (kind === 'primary' || kind === 'danger') && index - previous.index <= 6) offenders.push(`${file}:${previous.index + 1}->${index + 1}`);
      previous = { kind, index, directional };
    });
  }
  assert.deepEqual(offenders, [], 'secondary before primary');
});
