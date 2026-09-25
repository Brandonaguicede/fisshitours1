// Focused coverage for flows the QA pass flagged as critical/destructive and
// untested: auth guard, Tour visibility toggle, Boat deletion, and rejecting
// an invalid upload before it ever reaches storage. Not a full suite — each
// test checks one real user-facing behavior, not internals.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

async function loggedInFixture() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const writes = [];
  const boats = [{ id: 'boat-1', name: 'Second Wind', max_guests: 8, active: true, sort_order: 1, engine: 'Yamaha 250', length: '32ft', boat_images: [] }];
  // Shaped to satisfy both consumers that hit `/tours` (AdminToursPage's own
  // `select('*')` and the boat-tours-editor's narrower column list).
  const tours = [{ id: 'tour-1', title: 'Fishing Tour', slug: 'fishing-tour', description: 'Half day', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 1, location: 'Playas del Coco' }];
  const boatTourLinks = [{ id: 'link-1', boat_id: 'boat-1', tour_id: 'tour-1', active: true, sort_order: 1 }];
  const tourPackages = [{
    id: 'pkg-1', boat_tour_id: 'link-1', name: 'Half Day', package_type: 'half-day', duration_minutes: 240, base_price: 350,
    included_guests: 2, max_guests: 6, extra_guest_price: 0, description: '', departure_times: null, meal_options: null,
    package_included: null, custom_quote: false, active: true, sort_order: 1,
  }];

  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });

    if (path.endsWith('/boats')) {
      if (method === 'PATCH') { writes.push({ table: 'boats', method, body: request.postDataJSON() }); return route.fulfill({ json: [] }); }
      if (method === 'DELETE') { writes.push({ table: 'boats', method, id: url.searchParams.get('id') }); return route.fulfill({ json: [] }); }
      return route.fulfill({ json: boats });
    }
    if (path.endsWith('/tours')) {
      if (method === 'PATCH') { writes.push({ table: 'tours', method, body: request.postDataJSON() }); return route.fulfill({ json: [] }); }
      return route.fulfill({ json: tours });
    }
    if (path.endsWith('/boat_tours')) return route.fulfill({ json: boatTourLinks });
    if (path.endsWith('/time_slots')) return route.fulfill({ json: [] });
    if (path.endsWith('/tour_packages')) {
      if (method === 'DELETE') { writes.push({ table: 'tour_packages', method, id: url.searchParams.get('id') }); return route.fulfill({ json: [] }); }
      return route.fulfill({ json: tourPackages });
    }
    // Everything else this page incidentally queries (relations, images,
    // packages, categories, etc.) — none of it matters for these assertions.
    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });

  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, writes };
}

test('auth guard redirects to login when there is no session', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    // No route mocking at all: every Supabase call fails/returns 401-ish, so
    // getCurrentAdminProfile() never resolves a profile.
    await page.goto(`${base}/admin/reservations`);
    await expect(page).toHaveURL(/\/admin\/login$/);
  } finally {
    await browser.close();
  }
});

test('tour visibility toggle sends the correct publication_status and does not require touching business logic', async () => {
  const f = await loggedInFixture();
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/tours`);
    await page.getByRole('button', { name: /Editar tour/ }).click();
    await expect(page.getByRole('heading', { name: 'Fishing Tour' })).toBeVisible();
    await page.getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: /Ocultar tour/ }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'tours' && w.method === 'PATCH').length).toBeGreaterThan(0);
    const update = writes.find((w) => w.table === 'tours' && w.method === 'PATCH');
    assert.equal(update.body.publication_status, 'inactive');
  } finally {
    await f.browser.close();
  }
});

test('deleting a boat requires explicit confirmation and calls delete only after confirming', async () => {
  const f = await loggedInFixture();
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: /Editar bote/ }).click();
    // Delete lives in the last wizard step (Configuración).
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: 'Eliminar bote' }).click();
    // Confirmation modal must appear — deleting must not have happened yet.
    await expect(page.getByRole('heading', { name: 'Eliminar bote' })).toBeVisible();
    assert.equal(writes.filter((w) => w.table === 'boats' && w.method === 'DELETE').length, 0);
    await page.locator('.admin-modal-card').getByRole('button', { name: 'Eliminar bote' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'boats' && w.method === 'DELETE').length).toBeGreaterThan(0);
  } finally {
    await f.browser.close();
  }
});

test('deleting a package requires explicit confirmation, and cancelling does not delete', async () => {
  const f = await loggedInFixture();
  const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: /Editar bote/ }).click();
    await page.getByRole('button', { name: 'Tours y paquetes' }).click();
    await page.getByRole('button', { name: /Editar Half Day/ }).click();
    await expect(page.getByRole('heading', { name: /Editar Half Day/ })).toBeVisible();

    // First click only opens the confirmation — must not delete yet.
    await page.getByRole('button', { name: 'Eliminar paquete' }).click();
    await expect(page.getByRole('heading', { name: 'Eliminar paquete' })).toBeVisible();
    assert.equal(writes.filter((w) => w.table === 'tour_packages' && w.method === 'DELETE').length, 0);

    // Cancelling ("Volver") must not delete either.
    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(page.getByRole('heading', { name: 'Eliminar paquete' })).toHaveCount(0);
    assert.equal(writes.filter((w) => w.table === 'tour_packages' && w.method === 'DELETE').length, 0);

    // Only the explicit confirm actually deletes.
    await page.getByRole('button', { name: 'Eliminar paquete' }).click();
    await page.getByRole('button', { name: 'Sí, eliminar paquete' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'tour_packages' && w.method === 'DELETE').length).toBeGreaterThan(0);
  } finally {
    await f.browser.close();
  }
});

test('an invalid file is rejected before any upload request is made', async () => {
  const f = await loggedInFixture();
  const { page } = f;
  const uploadRequests = [];
  page.on('request', (req) => { if (req.url().includes('/functions/v1/') || req.url().includes('r2')) uploadRequests.push(req.url()); });
  try {
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Nueva imagen' }).click();
    const fileInput = page.getByLabel('Elegir archivo de imagen');
    await fileInput.setInputFiles({ name: 'not-an-image.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByText('Formato no admitido. Usa JPG, PNG o WebP.')).toBeVisible();
    assert.equal(uploadRequests.length, 0);
  } finally {
    await f.browser.close();
  }
});
