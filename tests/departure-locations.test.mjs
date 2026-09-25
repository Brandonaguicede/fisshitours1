// Departure locations: position (sort_order) is the only ordering AND the default. `is_default` stays in the schema
// but must never decide anything. Covers the pure ordering helpers, the public query contract, the admin table
// (Posición column, no Predeterminado, sort_order normalized to 1..N after save/reorder) and the public booking
// selector (first position preselected, keyboard accessible, unaffected by is_default).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
import { loadTs, plain } from './support/load-ts.mjs';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

const location = (id, name, sort_order, extra = {}) => ({ id, name, slug: id, description: '', surcharge_amount: 0, currency: 'USD', active: true, sort_order, ...extra });

// ---------- pure helpers ----------

function helpers() {
  return loadTs('src/utils/departureLocations.ts', vm.createContext({ Number }));
}

test('sortDepartureLocations orders by sort_order, then name, then id, ignoring is_default', () => {
  const { sortDepartureLocations } = helpers();
  const sorted = sortDepartureLocations([
    location('c', 'Tamarindo', 3, { is_default: true }),
    location('b', 'Flamingo', 1),
    location('a', 'Coco', 1),
    location('d', 'Coco', 1),
  ]);
  assert.deepEqual(plain(sorted.map((item) => item.id)), ['a', 'd', 'b', 'c']);
});

test('getDefaultDepartureLocation is position 1 even when another row has is_default', () => {
  const { getDefaultDepartureLocation } = helpers();
  const rows = [location('second', 'Tamarindo', 2, { is_default: true }), location('first', 'Coco', 1, { is_default: false })];
  assert.equal(getDefaultDepartureLocation(rows).id, 'first');
  assert.equal(getDefaultDepartureLocation([]), undefined);
});

test('normalizeDepartureLocationOrder yields contiguous 1..N and only rows that change', () => {
  const { normalizeDepartureLocationOrder } = helpers();
  assert.deepEqual(plain(normalizeDepartureLocationOrder([location('a', 'A', 3), location('b', 'B', 7), location('c', 'C', 9)])), [{ id: 'a', sort_order: 1 }, { id: 'b', sort_order: 2 }, { id: 'c', sort_order: 3 }]);
  assert.deepEqual(plain(normalizeDepartureLocationOrder([location('a', 'A', 1), location('b', 'B', 2)])), []);
  // Legacy duplicates (all 0) are resolved deterministically by name.
  assert.deepEqual(plain(normalizeDepartureLocationOrder([location('z', 'Zeta', 0), location('a', 'Alfa', 0)])), [{ id: 'a', sort_order: 1 }, { id: 'z', sort_order: 2 }]);
  // A hole after a delete closes up.
  assert.deepEqual(plain(normalizeDepartureLocationOrder([location('a', 'A', 1), location('c', 'C', 3)])), [{ id: 'c', sort_order: 2 }]);
});

// ---------- public query contract ----------

test('getActiveDepartureLocations queries active rows by sort_order asc, does not select is_default and re-sorts', async () => {
  const requests = [];
  const rows = [location('b', 'Tamarindo', 2, { is_default: true }), location('a', 'Coco', 1)];
  const supabase = createClient('https://admin-test.supabase.co', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url) => { requests.push(new URL(url)); return new Response(JSON.stringify(rows)); } },
  });
  const context = vm.createContext({ supabase, Number, Error, JSON });
  loadTs('src/utils/departureLocations.ts', context);
  // Only this function: the rest of bookingService.ts uses import.meta, which a vm script cannot evaluate.
  const whole = fs.readFileSync('src/services/bookingService.ts', 'utf8');
  const source = whole.slice(whole.indexOf('export async function getActiveDepartureLocations')).replace(/^export /gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  const result = await context.getActiveDepartureLocations();
  const url = requests[0];
  assert.equal(url.searchParams.get('active'), 'eq.true');
  assert.equal(url.searchParams.get('order'), 'sort_order.asc,name.asc');
  assert.ok(!url.searchParams.get('select').includes('is_default'));
  // Even though the (mock) backend answered out of order and flagged the 2nd row as default, position 1 comes first.
  assert.deepEqual(plain(result.map((item) => item.id)), ['a', 'b']);
});

// ---------- admin ----------

async function adminFixture(initial) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  const writes = [];
  const state = { rows: [...initial] };
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('/departure_locations')) {
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        const id = url.searchParams.get('id')?.replace('eq.', '');
        writes.push({ method, body, id });
        state.rows = state.rows.map((row) => (row.id === id ? { ...row, ...body } : row));
        return route.fulfill({ json: [] });
      }
      if (method === 'POST') {
        const body = request.postDataJSON();
        writes.push({ method, body });
        state.rows.push({ id: `new-${state.rows.length}`, slug: body.slug, ...body });
        return route.fulfill({ json: [] });
      }
      return route.fulfill({ json: [...state.rows].sort((a, b) => a.sort_order - b.sort_order) });
    }
    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, writes, state };
}

test('admin: Posición column follows sort_order and there is no Predeterminado column, control or text', async () => {
  const f = await adminFixture([location('loc-2', 'Tamarindo', 2, { is_default: true }), location('loc-1', 'Playas del Coco', 1, { is_default: false })]);
  const { page } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(2);
    await expect(page.getByRole('columnheader', { name: 'Posición' })).toBeVisible();
    await expect(page.getByText('Predeterminado')).toHaveCount(0);
    const rows = page.locator('.admin-table tbody tr');
    await expect(rows.nth(0).locator('td').first()).toHaveText('1');
    await expect(rows.nth(0)).toContainText('Playas del Coco');
    await expect(rows.nth(1).locator('td').first()).toHaveText('2');
    await expect(rows.nth(1)).toContainText('Tamarindo');

    // A search does not renumber: Tamarindo stays position 2.
    await page.getByPlaceholder('Buscar lugar por nombre').fill('Tamarindo');
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.admin-table tbody tr td').first()).toHaveText('2');
    await page.getByPlaceholder('Buscar lugar por nombre').fill('');

    // The editor has no default checkbox and shows the current position.
    await page.getByRole('button', { name: 'Editar lugar de salida Tamarindo' }).click();
    await expect(page.getByText('Seleccionado por defecto')).toHaveCount(0);
    await expect(page.getByText('Posición actual: 2.')).toBeVisible();
  } finally {
    await f.browser.close();
  }
});

test('admin: saving a location normalizes persisted sort_order to 1..N and never writes is_default', async () => {
  // Legacy data with holes/duplicates.
  const f = await adminFixture([location('loc-a', 'Alfa', 3), location('loc-b', 'Beta', 7), location('loc-c', 'Gamma', 7)]);
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(3);
    await page.getByRole('button', { name: 'Editar lugar de salida Beta' }).click();
    await page.locator('.admin-modal-body textarea').fill('');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Lugar actualizado.')).toBeVisible();

    // The edit itself never sends sort_order or is_default.
    const editWrite = writes.find((write) => write.id === 'loc-b' && 'name' in write.body);
    assert.ok(editWrite);
    assert.ok(!('is_default' in editWrite.body));
    assert.ok(!('sort_order' in editWrite.body));

    // Normalization then rewrites the persisted order to contiguous 1..N.
    const finalOrder = Object.fromEntries(f.state.rows.map((row) => [row.id, row.sort_order]));
    assert.deepEqual(finalOrder, { 'loc-a': 1, 'loc-b': 2, 'loc-c': 3 });
    assert.ok(writes.every((write) => !('is_default' in write.body)));
    const rows = page.locator('.admin-table tbody tr');
    await expect(rows.nth(2).locator('td').first()).toHaveText('3');
  } finally {
    await f.browser.close();
  }
});

test('admin: a new location goes last and the whole list ends up contiguous', async () => {
  const f = await adminFixture([location('loc-a', 'Alfa', 1), location('loc-b', 'Beta', 5)]);
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: 'Nuevo lugar' }).click();
    await page.locator('.admin-modal-body input.admin-input').first().fill('Zeta');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Lugar creado.')).toBeVisible();
    const insert = writes.find((write) => write.method === 'POST');
    assert.equal(insert.body.sort_order, 6);
    assert.ok(!('is_default' in insert.body));
    assert.deepEqual(f.state.rows.map((row) => row.sort_order).sort(), [1, 2, 3]);
  } finally {
    await f.browser.close();
  }
});

test('admin: reordering keeps its labelled controls, shows positions and persists 1..N', async () => {
  const f = await adminFixture([location('loc-1', 'Playas del Coco', 1), location('loc-2', 'Tamarindo', 2), location('loc-3', 'Flamingo', 3)]);
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: 'Reordenar' }).click();
    const rows = page.locator('tr.admin-sortable-row');
    await expect(rows.nth(0).locator('.admin-reorder-handle__position')).toHaveText('1');
    await expect(rows.nth(2).locator('.admin-reorder-handle__position')).toHaveText('3');
    await expect(rows.first().getByRole('button', { name: 'Subir' })).toBeDisabled();
    // Keyboard: focus the Subir button of the last row and activate it with Enter.
    await rows.nth(2).getByRole('button', { name: 'Subir' }).focus();
    await page.keyboard.press('Enter');
    await expect(rows.nth(1)).toContainText('Flamingo');
    await page.getByRole('button', { name: 'Guardar orden' }).click();
    await expect.poll(() => f.state.rows.map((row) => `${row.id}:${row.sort_order}`).sort().join()).toBe('loc-1:1,loc-2:3,loc-3:2');
    assert.ok(writes.every((write) => !('is_default' in write.body)));
    await expect(page.locator('.admin-table tbody tr').nth(1).locator('td').first()).toHaveText('2');
    await expect(page.locator('.admin-table tbody tr').nth(1)).toContainText('Flamingo');
  } finally {
    await f.browser.close();
  }
});

// ---------- public booking selector ----------

async function bookingFixture(locations) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });
  const priceRequests = [];
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
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/boats')) return route.fulfill({ json: [boatRow] });
    if (path.endsWith('/tour_packages')) return route.fulfill({ json: [tourPackageRow] });
    if (path.endsWith('/time_slots')) return route.fulfill({ json: [{ id: 'slot-1', label: 'Morning', starts_at: '07:00:00' }] });
    if (path.endsWith('/departure_locations')) return route.fulfill({ json: locations });
    if (path.endsWith('/functions/v1/get-booking-availability')) return route.fulfill({ json: { slots: [{ id: 'slot-1', label: 'Morning', time: '07:00', available: true }] } });
    if (path.endsWith('/functions/v1/calculate-booking-price')) {
      priceRequests.push(request.postDataJSON());
      return route.fulfill({ json: { custom_quote: false, base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, extra_guests: 0, extra_guests_total: 0, extras: [], extras_total: 0, total: 650, currency: 'USD' } });
    }
    return route.fulfill({ json: [] });
  });
  return { browser, page, priceRequests };
}

async function openDepartureStep(page) {
  await page.goto(`${base}/reservar`);
  const acceptDialog = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
  if (await acceptDialog.isVisible().catch(() => false)) await acceptDialog.click();
  const booking = page.locator('main');
  await booking.getByRole('button', { name: /Continue/i }).first().click();
  await booking.getByRole('button', { name: /Fishing/i }).first().click();
  await page.getByLabel(/Date/i).fill('2026-12-01');
  await page.locator('main label').filter({ hasText: 'Morning' }).first().click();
  await booking.getByRole('button', { name: /Continue/i }).last().click();
  await expect(page.locator('input[name="departureLocation"]').first()).toBeAttached();
}

test('public selector: lists by sort_order, preselects position 1 (not is_default) and stays keyboard operable', async () => {
  // Backend answers out of order and flags position 2 as is_default.
  const f = await bookingFixture([
    location('loc-3', 'Flamingo', 3, { surcharge_amount: 50 }),
    location('loc-2', 'Tamarindo', 2, { is_default: true, surcharge_amount: 30 }),
    location('loc-1', 'Playas del Coco', 1),
  ]);
  const { page } = f;
  try {
    await openDepartureStep(page);
    const radios = page.locator('input[name="departureLocation"]');
    await expect(radios).toHaveCount(3);
    const values = await radios.evaluateAll((nodes) => nodes.map((node) => node.value));
    assert.deepEqual(values, ['loc-1', 'loc-2', 'loc-3']);
    await expect(radios.nth(0)).toBeChecked();
    await expect(radios.nth(1)).not.toBeChecked();
    // Position 1 is usable straight away: no "select a departure location" error, Continue is enabled.
    await expect(page.locator('#departure-location-error')).toHaveCount(0);
    await expect(page.locator('main').getByRole('button', { name: /Continuar|Continue/i }).last()).toBeEnabled();

    // Keyboard: the radio group moves selection with the arrow keys.
    await radios.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(radios.nth(1)).toBeChecked();
    await expect.poll(() => f.priceRequests.at(-1)?.departureLocationId).toBe('loc-2');
  } finally {
    await f.browser.close();
  }
});

test('public selector: a single location is selected and an empty list keeps the empty state', async () => {
  const single = await bookingFixture([location('only', 'Playas del Coco', 1)]);
  try {
    await openDepartureStep(single.page);
    await expect(single.page.locator('input[name="departureLocation"]').first()).toBeChecked();
  } finally {
    await single.browser.close();
  }
  const empty = await bookingFixture([]);
  try {
    await empty.page.goto(`${base}/reservar`);
    const accept = empty.page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
    if (await accept.isVisible().catch(() => false)) await accept.click();
    const booking = empty.page.locator('main');
    await booking.getByRole('button', { name: /Continue/i }).first().click();
    await booking.getByRole('button', { name: /Fishing/i }).first().click();
    await empty.page.getByLabel(/Date/i).fill('2026-12-01');
    await empty.page.locator('main label').filter({ hasText: 'Morning' }).first().click();
    await booking.getByRole('button', { name: /Continue/i }).last().click();
    await expect(empty.page.getByText('No departure locations available.')).toBeVisible();
    await expect(empty.page.locator('input[name="departureLocation"]')).toHaveCount(0);
  } finally {
    await empty.browser.close();
  }
});
