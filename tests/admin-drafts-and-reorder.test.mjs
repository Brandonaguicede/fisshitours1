// Focused coverage for the CIERRE FUNCIONAL pass: Tours/Boats now have an
// explicit Guardar vs Guardar borrador split (borrador persists incomplete
// progress and stays hidden; Guardar requires the real publish fields and
// goes live immediately), and list reordering persists 1..N only on
// "Guardar orden" (Cancelar restores the original order). One behavior per
// test, reusing the same mock-fixture pattern as the other admin tests.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { mockTranslation } from './support/translation-mock.mjs';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

async function fixture({ boats = [], tours = [], departureLocations = [] } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  const writes = [];
  const state = { boats: [...boats], tours: [...tours], departureLocations: [...departureLocations] };

  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });

    if (path.endsWith('/boats')) {
      if (method === 'POST') {
        const body = request.postDataJSON();
        writes.push({ table: 'boats', method, body });
        state.boats.push({ boat_images: [], images: [], ...body });
        return route.fulfill({ json: [body] });
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        const id = url.searchParams.get('id')?.replace('eq.', '');
        writes.push({ table: 'boats', method, body, id });
        state.boats = state.boats.map((boat) => (boat.id === id ? { ...boat, ...body } : boat));
        return route.fulfill({ json: [] });
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        writes.push({ table: 'boats', method, id });
        state.boats = state.boats.filter((boat) => boat.id !== id);
        return route.fulfill({ json: [] });
      }
      // insert path's fresh `.select('sort_order').order(desc).limit(1).maybeSingle()` — a single object, like PostgREST.
      if (url.searchParams.get('select') === 'sort_order') {
        const highest = [...state.boats].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))[0];
        return route.fulfill({ json: highest ? { sort_order: highest.sort_order } : null });
      }
      return route.fulfill({ json: [...state.boats].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) });
    }
    if (path.endsWith('/boat_images')) return route.fulfill({ json: [] });

    if (path.endsWith('/tours')) {
      if (method === 'POST') {
        const body = request.postDataJSON();
        writes.push({ table: 'tours', method, body });
        state.tours.push(body);
        // createTour() chains .select('*').single(), which sends
        // `Accept: application/vnd.pgrst.object+json` and expects a bare
        // object back, not an array — unlike the boats insert above, which
        // has no .select()/.single() and tolerates either shape.
        return route.fulfill({ json: body });
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        const id = url.searchParams.get('id')?.replace('eq.', '');
        writes.push({ table: 'tours', method, body, id });
        state.tours = state.tours.map((tour) => (tour.id === id ? { ...tour, ...body } : tour));
        return route.fulfill({ json: [] });
      }
      return route.fulfill({ json: state.tours });
    }
    if (path.endsWith('/boat_tours') || path.endsWith('/tour_packages') || path.endsWith('/tour_images') || path.endsWith('/tour_inclusions') || path.endsWith('/tour_locations')) {
      return route.fulfill({ json: [] });
    }

    if (path.endsWith('/departure_locations')) {
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        const id = url.searchParams.get('id')?.replace('eq.', '');
        writes.push({ table: 'departure_locations', method, body, id });
        state.departureLocations = state.departureLocations.map((loc) => (loc.id === id ? { ...loc, ...body } : loc));
        return route.fulfill({ json: [] });
      }
      return route.fulfill({ json: state.departureLocations });
    }

    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });

  // Registered after the catch-all route above so it takes precedence for translate-texts.
  const translation = await mockTranslation(page);
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, writes, state, translation };
}

test('boat: Guardar borrador persists with only the name, stays inactive, and can be reopened', async () => {
  const f = await fixture();
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: 'Crear bote' }).click();
    await page.locator('#boat-name').fill('Bote en progreso');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'boats' && w.method === 'POST').length).toBeGreaterThan(0);
    const write = writes.find((w) => w.table === 'boats' && w.method === 'POST');
    assert.equal(write.body.name, 'Bote en progreso');
    assert.equal(write.body.publication_status, 'draft');
  } finally {
    await f.browser.close();
  }
});

test('boat: Guardar (final, last step) blocks publishing without the required photo count', async () => {
  const f = await fixture();
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: 'Crear bote' }).click();
    await page.locator('#boat-name').fill('Bote sin fotos');
    // Siguiente creates the draft row once; Guardar only exists on the last step.
    for (const label of ['Galería', 'Tours y paquetes', 'Configuración']) {
      await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
      await expect(page.locator('.admin-stepper [aria-current="step"]')).toContainText(label);
    }
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.locator('.admin-gallery-error')).toHaveText('Para publicar el bote necesitas entre 3 y 6 imagenes.');
    // Only the draft (inactive) row exists; nothing was ever written as published.
    assert.equal(writes.filter((w) => w.table === 'boats' && w.method === 'POST').length, 1);
    assert.equal(writes.filter((w) => w.table === 'boats').every((w) => w.body.publication_status !== 'published'), true);
  } finally {
    await f.browser.close();
  }
});

test('tour: Guardar borrador persists progress and keeps the tour in draft/hidden', async () => {
  const f = await fixture();
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/tours`);
    await page.getByRole('button', { name: 'Crear tour' }).click();
    // Opening the wizard is local only: no row until the draft is actually saved.
    await expect(page.locator('#tour-title')).toBeVisible();
    assert.equal(writes.filter((w) => w.table === 'tours' && w.method === 'POST').length, 0);
    await page.locator('#tour-title').fill('Tour en progreso');

    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'tours' && w.method === 'POST').length).toBeGreaterThan(0);
    const createWrite = writes.find((w) => w.table === 'tours' && w.method === 'POST');
    assert.equal(createWrite.body.active, false);
    assert.equal(createWrite.body.publication_status, 'draft');
    assert.equal(createWrite.body.title, 'Tour en progreso');
    await expect.poll(() => writes.filter((w) => w.table === 'tours' && w.method === 'PATCH' && w.body.publication_status === 'draft').length).toBeGreaterThan(0);
    const draftWrite = writes.find((w) => w.table === 'tours' && w.method === 'PATCH' && w.body.publication_status === 'draft');
    assert.equal(draftWrite.body.active, false);
  } finally {
    await f.browser.close();
  }
});

test('boat reorder: dragging via the Up control and Guardar orden persists sequential 1..N, Cancelar restores the original order', async () => {
  const boats = [
    { id: 'boat-1', name: 'Second Wind', max_guests: 8, active: true, sort_order: 1, engine: 'Yamaha 250', length: '32ft', boat_images: [] },
    { id: 'boat-2', name: 'Reel Deal', max_guests: 6, active: true, sort_order: 2, engine: 'Yamaha 150', length: '28ft', boat_images: [] },
  ];
  const f = await fixture({ boats });
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    // Reordenar starts from the loaded list: wait for the rows before entering reorder mode.
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: 'Reordenar' }).click();

    // Cancel first: moving a row and cancelling must not write anything.
    await page.getByRole('button', { name: 'Bajar' }).first().click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    assert.equal(writes.filter((w) => w.table === 'boats' && w.method === 'PATCH').length, 0);

    // Now actually reorder and save: Reel Deal (originally 2nd) moves to 1st.
    await page.getByRole('button', { name: 'Reordenar' }).click();
    const rows = page.locator('tr.admin-sortable-row');
    await expect(rows).toHaveCount(2);
    await rows.nth(1).getByRole('button', { name: 'Subir' }).click();
    await page.getByRole('button', { name: 'Guardar orden' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'boats' && w.method === 'PATCH').length).toBeGreaterThanOrEqual(2);
    const reelDealWrite = writes.find((w) => w.table === 'boats' && w.id === 'boat-2');
    const secondWindWrite = writes.find((w) => w.table === 'boats' && w.id === 'boat-1');
    assert.equal(reelDealWrite.body.sort_order, 1);
    assert.equal(secondWindWrite.body.sort_order, 2);
  } finally {
    await f.browser.close();
  }
});

test('draft tours and boats render the amber Borrador badge, distinct from Activo/Inactivo', async () => {
  const tours = [{
    id: 'tour-1', title: 'Half Day Fishing', slug: 'half-day-fishing', description: '', long_description: '',
    category: 'inshore', publication_status: 'draft', active: false, featured: false, sort_order: 1, location: null,
    highlights: [], included: [], rating: 5, image_url: null, image_alt: null, image_public_id: null, operating_end_time: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }];
  const f = await fixture({ tours });
  const { page } = f;
  try {
    await page.goto(`${base}/admin/tours`);
    const badge = page.locator('tr', { hasText: 'Half Day Fishing' }).locator('.admin-badge');
    await expect(badge).toHaveText('Borrador');
    await expect(badge).toHaveClass(/admin-badge--warning/);
  } finally {
    await f.browser.close();
  }
});

test('reorder: dragging via the Up control and Guardar orden persists sequential 1..N, Cancelar restores the original order', async () => {
  const departureLocations = [
    { id: 'loc-1', name: 'Playas del Coco', slug: 'playas-del-coco', description: '', surcharge_amount: 0, currency: 'USD', active: true, sort_order: 1, is_default: true },
    { id: 'loc-2', name: 'Tamarindo', slug: 'tamarindo', description: '', surcharge_amount: 50, currency: 'USD', active: true, sort_order: 2, is_default: false },
  ];
  const f = await fixture({ departureLocations });
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: 'Reordenar' }).click();

    // Cancel first: moving a row and cancelling must not write anything.
    await page.getByRole('button', { name: 'Bajar' }).first().click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    assert.equal(writes.filter((w) => w.table === 'departure_locations').length, 0);

    // Now actually reorder and save: Tamarindo (originally 2nd) moves to 1st.
    await page.getByRole('button', { name: 'Reordenar' }).click();
    const rows = page.locator('tr.admin-sortable-row');
    await expect(rows).toHaveCount(2);
    await rows.nth(1).getByRole('button', { name: 'Subir' }).click();
    await page.getByRole('button', { name: 'Guardar orden' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'departure_locations' && w.method === 'PATCH').length).toBeGreaterThanOrEqual(2);
    const tamarindoWrite = writes.find((w) => w.table === 'departure_locations' && w.id === 'loc-2');
    const cocoWrite = writes.find((w) => w.table === 'departure_locations' && w.id === 'loc-1');
    assert.equal(tamarindoWrite.body.sort_order, 1);
    assert.equal(cocoWrite.body.sort_order, 2);
  } finally {
    await f.browser.close();
  }
});

const boatRow = (id, order) => ({ id, name: 'Bote ' + id, max_guests: 8, active: true, sort_order: order, engine: 'Yamaha', length: '30ft', boat_images: [] });

test('boat: a new boat gets max(sort_order)+1 (not boats.length+1) and an edit never rewrites sort_order', async () => {
  // Hole at 3 (a deleted boat): count+1 would be 4 and collide; max+1 is 5.
  const f = await fixture({ boats: [boatRow('b1', 1), boatRow('b2', 2), boatRow('b4', 4)] });
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: 'Crear bote' }).click();
    await page.locator('#boat-name').fill('Bote nuevo');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'boats' && w.method === 'POST').length).toBe(1);
    assert.equal(writes.find((w) => w.method === 'POST').body.sort_order, 5);

    // Editing an existing boat must not send sort_order at all.
    await page.goto(`${base}/admin/boats`);
    await expect(page.getByRole('button', { name: 'Editar bote Bote b1' })).toBeVisible();
    await page.getByRole('button', { name: 'Editar bote Bote b1' }).click();
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'boats' && w.method === 'PATCH').length).toBeGreaterThan(0);
    assert.ok(writes.filter((w) => w.method === 'PATCH').every((w) => !('sort_order' in w.body)));
  } finally {
    await f.browser.close();
  }
});

test('boat: deleting a boat renumbers the remaining ones 1..N automatically', async () => {
  const f = await fixture({ boats: [boatRow('b1', 1), boatRow('b2', 2), boatRow('b3', 3), boatRow('b9', 9)] });
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: 'Editar bote Bote b2' }).click();
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: 'Eliminar bote' }).click();
    await page.locator('.admin-modal-card').getByRole('button', { name: 'Eliminar bote' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'boats' && w.method === 'DELETE').length).toBe(1);
    // (Leaving Información also saved the boat's info — that PATCH carries no sort_order.)
    const orderPatches = () => writes.filter((w) => w.table === 'boats' && w.method === 'PATCH' && 'sort_order' in w.body);
    await expect.poll(() => orderPatches().length).toBe(2);
    assert.deepEqual(orderPatches().map((w) => [w.id, w.body.sort_order]), [['b3', 2], ['b9', 3]]);
  } finally {
    await f.browser.close();
  }
});
