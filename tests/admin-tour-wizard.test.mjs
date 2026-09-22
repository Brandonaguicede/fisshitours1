// Focused coverage for the Tours wizard UX pass: a new tour starts with an
// empty (required) name, the 5-step stepper stays on one row, prev/next are
// icon-only with accessible names, and the Experiencia lists render as
// chips without layout overlap. Same mock-fixture pattern as the other admin
// tests — nothing here talks to a real Supabase project.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

async function fixture({ withPackages = true, publicationStatus = 'published', slowCreate = 0, tours: toursOverride, imageCount = 0 } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const writes = [];
  const defaultTours = [{ id: 'tour-1', title: 'Fishing Tour', slug: 'fishing-tour', description: 'Half day', long_description: '', category: 'Fishing', publication_status: publicationStatus, active: publicationStatus === 'published', featured: false, sort_order: 1, highlights: ['Pesca deportiva'], included: [] }];
  const state = { tours: toursOverride ?? defaultTours };
  const imagesTourId = state.tours[0].id;
  const boats = [{ id: 'boat-1', name: 'Second Wind', max_guests: 8, active: true, sort_order: 1 }, { id: 'boat-2', name: 'Costa del Sol Boat', max_guests: 10, active: true, sort_order: 2 }];
  const relations = withPackages ? [{ id: 'l1', boat_id: 'boat-1', tour_id: imagesTourId, active: true, sort_order: 1 }] : [];
  const pkg = (id, name) => ({ id, boat_tour_id: 'l1', name, package_type: 'half-day', duration_minutes: 240, base_price: 350, included_guests: 2, max_guests: 6, extra_guest_price: 0, description: '', image_url: null, image_public_id: null, sort_order: 1, active: true, custom_quote: false });
  const packages = withPackages ? [pkg('p1', 'Half Day'), pkg('p2', 'Full Day')] : [];
  const images = Array.from({ length: imageCount }, (_, i) => ({ id: `img${i + 1}`, tour_id: imagesTourId, image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', storage_path: `p${i + 1}`, alt_text: `foto ${i + 1}`, is_primary: i === 0, sort_order: i + 1, active: true }));

  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('/tours')) {
      if (method === 'POST') {
        if (slowCreate) await new Promise((resolve) => setTimeout(resolve, slowCreate));
        const body = request.postDataJSON();
        writes.push({ table: 'tours', method, body });
        state.tours.push(body);
        return route.fulfill({ json: body });
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        const id = url.searchParams.get('id')?.replace('eq.', '');
        writes.push({ table: 'tours', method, body, id });
        state.tours = state.tours.map((tour) => (tour.id === id ? { ...tour, ...body } : tour));
        return route.fulfill({ json: [] });
      }
      // `.select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()`
      // — the fresh max(sort_order) read insertTourRow does right before creating a tour.
      // Mocked like real PostgREST: a single object (or null), never an array.
      if (method === 'GET' && url.searchParams.get('select') === 'sort_order') {
        const highest = [...state.tours].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))[0];
        return route.fulfill({ json: highest ? { sort_order: highest.sort_order } : null });
      }
      // The real query is `.order('sort_order')` (ascending) — sort the mock's response
      // the same way, so tests can rely on visual row order matching sort_order.
      return route.fulfill({ json: [...state.tours].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) });
    }
    if (path.endsWith('/boats')) return route.fulfill({ json: boats });
    if (path.endsWith('/boat_tours')) return route.fulfill({ json: relations });
    if (path.endsWith('/tour_packages')) return route.fulfill({ json: packages });
    if (path.endsWith('/tour_images')) return route.fulfill({ json: images });
    if (method !== 'GET' && method !== 'HEAD') { writes.push({ table: path.split('/').pop(), method, body: request.postDataJSON() }); return route.fulfill({ json: [] }); }
    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });

  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  await page.goto(`${base}/admin/tours`);
  return { browser, page, writes };
}

const posts = (writes) => writes.filter((w) => w.table === 'tours' && w.method === 'POST');
const patches = (writes) => writes.filter((w) => w.table === 'tours' && w.method === 'PATCH');
const openExisting = (page) => page.getByRole('button', { name: /Editar tour/ }).click();
const activeStep = (page) => page.locator('.admin-stepper [aria-current="step"]');

test('opening "Crear tour" inserts nothing: empty local wizard, empty name, "Crear tour" header', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    const name = page.getByLabel('Nombre del tour');
    await expect(name).toBeVisible();
    await expect(name).toHaveValue('');
    await expect(name).toHaveAttribute('placeholder', 'Ej. Fishing Tour');
    await expect(page.getByRole('heading', { name: 'Crear tour' })).toBeVisible();
    await expect(page.getByText('Nuevo tour')).toHaveCount(0);
    // Give any (wrong) premature write time to happen before asserting there is none.
    await page.waitForTimeout(600);
    assert.equal(posts(writes).length, 0);
    assert.equal(writes.length, 0);
  } finally { await f.browser.close(); }
});

test('cancelling or closing before the tour is created leaves no row behind', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await expect(page.getByLabel('Nombre del tour')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.locator('.admin-tour-modal')).toHaveCount(0);
    // Typed a name but never advanced/saved, then closed with the X (confirming the discard).
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByLabel('Nombre del tour').fill('Tour descartado');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Cerrar editor' }).click();
    await expect(page.locator('.admin-tour-modal')).toHaveCount(0);
    await page.waitForTimeout(400);
    assert.equal(writes.length, 0, 'no INSERT/UPDATE may happen for an abandoned new tour');
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(1);
  } finally { await f.browser.close(); }
});

test('Siguiente with a valid name creates exactly one draft (even on double click) and moves to Galería', async () => {
  const f = await fixture({ slowCreate: 400 }); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByLabel('Nombre del tour').fill('  Sunset Cruise  ');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).dblclick();
    await expect(activeStep(page)).toContainText('Galería');
    assert.equal(posts(writes).length, 1);
    const created = posts(writes)[0].body;
    assert.equal(created.title, 'Sunset Cruise');
    assert.equal(created.publication_status, 'draft');
    assert.equal(created.active, false);
    // The same real id is reused for the info save that follows; no other tour is touched.
    const infoSave = patches(writes).find((w) => w.body.title === 'Sunset Cruise');
    assert.equal(infoSave.id, created.id);
    assert.ok(patches(writes).every((w) => w.id === created.id));
  } finally { await f.browser.close(); }
});

test('Siguiente without a name (button or stepper) creates nothing', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.locator('#tour-title-error')).toBeVisible();
    await page.locator('.admin-stepper').getByRole('button', { name: 'Galería' }).click();
    await expect(page.locator('#tour-title-error')).toBeVisible();
    await expect(activeStep(page)).toContainText('Información');
    assert.equal(writes.length, 0);
  } finally { await f.browser.close(); }
});

test('Guardar borrador creates exactly one draft and closes the wizard (even on double click)', async () => {
  const f = await fixture({ slowCreate: 400 }); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByLabel('Nombre del tour').fill('Borrador directo');
    await page.getByRole('button', { name: 'Guardar borrador' }).dblclick();
    await expect(page.locator('.admin-tour-modal')).toHaveCount(0);
    assert.equal(posts(writes).length, 1);
    assert.equal(posts(writes)[0].body.title, 'Borrador directo');
    assert.equal(posts(writes)[0].body.publication_status, 'draft');
    assert.ok(patches(writes).some((w) => w.body.publication_status === 'draft' && w.body.active === false && w.id === posts(writes)[0].body.id));
  } finally { await f.browser.close(); }
});

test('after the tour exists, moving between steps never inserts again (stepper jump from a new tour creates it once)', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByLabel('Nombre del tour').fill('Tour de prueba');
    // Jump straight to Paquetes from step 1 with the stepper: it must create the row first.
    await page.locator('.admin-stepper').getByRole('button', { name: 'Paquetes' }).click();
    await expect(activeStep(page)).toContainText('Paquetes');
    assert.equal(posts(writes).length, 1);
    const next = page.getByRole('button', { name: 'Siguiente', exact: true });
    const prev = page.getByRole('button', { name: 'Anterior', exact: true });
    await next.click();
    await expect(activeStep(page)).toContainText('Configuración');
    await prev.click(); await prev.click(); await prev.click();
    await expect(activeStep(page)).toContainText('Galería');
    await page.locator('.admin-stepper').getByRole('button', { name: 'Información' }).click();
    await next.click(); await next.click();
    await expect(activeStep(page)).toContainText('Experiencia');
    assert.equal(posts(writes).length, 1);
  } finally { await f.browser.close(); }
});

test('editing an existing tour never inserts a new one', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await openExisting(page);
    await expect(page.getByRole('heading', { name: 'Fishing Tour' })).toBeVisible();
    const next = page.getByRole('button', { name: 'Siguiente', exact: true });
    await next.click(); await next.click(); await next.click();
    await expect(activeStep(page)).toContainText('Paquetes');
    assert.equal(posts(writes).length, 0);
    assert.ok(patches(writes).length > 0 && patches(writes).every((w) => w.id === 'tour-1'));
  } finally { await f.browser.close(); }
});

test('the name is required: inline error, no generic alert, no advance, no save', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    const name = page.getByLabel('Nombre del tour');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.locator('#tour-title-error')).toHaveText('El nombre del tour es obligatorio.');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toBeFocused();
    await expect(activeStep(page)).toContainText('Información');
    await expect(page.locator('.admin-gallery-error')).toHaveCount(0);
    // "Guardar borrador" without a name shows the same inline error instead of saving.
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.locator('#tour-title-error')).toBeVisible();
    assert.equal(writes.length, 0, 'validation errors must not write anything (no insert, no update)');
    // Typing a name clears the error.
    await name.fill('Fishing Tour');
    await expect(page.locator('#tour-title-error')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

test('the stepper has 5 steps on a single row on desktop', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openExisting(page);
    await expect(page.locator('.admin-stepper > li')).toHaveCount(5);
    const tops = await page.locator('.admin-stepper > li').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1, `steps are not on one row: ${tops}`);
    const overflow = await page.locator('.admin-stepper').evaluate((ol) => ol.scrollWidth > ol.clientWidth);
    assert.equal(overflow, false);
  } finally { await f.browser.close(); }
});

test('previous/next are icon-only buttons that keep their accessible names and reach the last step', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openExisting(page);
    const prev = page.getByRole('button', { name: 'Anterior', exact: true });
    const next = page.getByRole('button', { name: 'Siguiente', exact: true });
    await expect(prev).toBeDisabled();
    assert.equal((await prev.innerText()).trim(), '');
    assert.equal((await next.innerText()).trim(), '');
    await expect(next).toHaveAttribute('aria-label', 'Siguiente');
    await expect(prev).toHaveAttribute('aria-label', 'Anterior');
    for (const label of ['Galería', 'Experiencia', 'Paquetes', 'Configuración']) {
      await next.click();
      await expect(activeStep(page)).toContainText(label);
    }
    // Last step: [←] [Guardar], no "Siguiente".
    await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible();
    await expect(prev).toBeEnabled();
    await prev.click();
    await expect(activeStep(page)).toContainText('Paquetes');
  } finally { await f.browser.close(); }
});

test('activities and "Incluye" are added as chips without breaking the layout, and persist the same arrays', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Experiencia' }).click();
    await expect(page.getByText('Listas editables sin un máximo artificial.')).toHaveCount(0);
    const activities = page.getByRole('list', { name: 'Lista de actividades del tour' });
    const includes = page.getByRole('list', { name: 'Lista de incluye' });
    await expect(activities.getByRole('listitem')).toHaveCount(1);

    const activityInput = page.getByLabel('Actividades del tour', { exact: true });
    for (const label of ['Snorkeling', 'Avistamiento de delfines', 'Playa privada al atardecer con parada de almuerzo y una descripción bastante larga']) {
      await activityInput.fill(label);
      await page.getByRole('button', { name: 'Agregar actividad' }).click();
      await expect(activityInput).toHaveValue('');
    }
    // Enter adds too — and must not submit the whole wizard form.
    await activityInput.fill('Cena');
    await activityInput.press('Enter');
    await expect(activities.getByRole('listitem')).toHaveCount(5);

    const includeInput = page.getByLabel('Incluye', { exact: true });
    for (const label of ['Bebidas', 'Equipo de pesca', 'Capitán y tripulación']) {
      await includeInput.fill(label);
      await page.getByRole('button', { name: 'Agregar a incluye' }).click();
    }
    await expect(includes.getByRole('listitem')).toHaveCount(3);
    assert.equal(writes.length, 0, 'adding items must not write anything by itself');

    // Chips stay inside the card and never overlap each other or the inputs.
    const layout = await page.evaluate(() => {
      const section = document.querySelector('.admin-tour-step-body .admin-form-section').getBoundingClientRect();
      const boxes = [...document.querySelectorAll('.admin-token, .admin-tour-list-field__add')].map((el) => el.getBoundingClientRect());
      const overlaps = boxes.some((a, i) => boxes.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
      return { inside: boxes.every((b) => b.left >= section.left - 1 && b.right <= section.right + 1), overlaps };
    });
    assert.deepEqual(layout, { inside: true, overlaps: false });

    // Removing chips works for both lists.
    await page.getByRole('button', { name: 'Eliminar actividad Snorkeling' }).click();
    await page.getByRole('button', { name: 'Eliminar Bebidas' }).click();
    await expect(activities.getByRole('listitem')).toHaveCount(4);
    await expect(includes.getByRole('listitem')).toHaveCount(2);

    // Siguiente persists the same shapes as before: highlights = string[], included = string[].
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'tours' && w.body.highlights).length).toBeGreaterThan(0);
    const saved = writes.find((w) => w.table === 'tours' && w.body.highlights).body;
    assert.deepEqual(saved.highlights, ['Pesca deportiva', 'Avistamiento de delfines', 'Playa privada al atardecer con parada de almuerzo y una descripción bastante larga', 'Cena']);
    assert.deepEqual(saved.included, ['Equipo de pesca', 'Capitán y tripulación']);
  } finally { await f.browser.close(); }
});

test('Paquetes: compact summary per boat when packages exist, small empty state otherwise, CTA goes to Botes', async () => {
  const withPackages = await fixture(); const a = withPackages.page;
  try {
    await openExisting(a);
    await a.locator('.admin-stepper').getByRole('button', { name: 'Paquetes' }).click();
    const row = a.locator('.admin-tour-boat-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Second Wind');
    await expect(row).toContainText('2 paquetes');
    const height = await a.locator('.admin-tour-step-body .admin-form-section').evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(height < 260, `packages card should be compact, was ${height}px`);
    await a.getByRole('button', { name: /Editar en Botes/ }).click();
    await expect(a).toHaveURL(/\/admin\/boats\?boatId=boat-1$/);
  } finally { await withPackages.browser.close(); }

  const empty = await fixture({ withPackages: false }); const b = empty.page;
  try {
    await openExisting(b);
    await b.locator('.admin-stepper').getByRole('button', { name: 'Paquetes' }).click();
    await expect(b.getByText('Este tour aún no tiene paquetes asociados.')).toBeVisible();
    await expect(b.getByText('Añadir este tour a otro bote')).toHaveCount(0);
    const height = await b.locator('.admin-tour-step-body .admin-form-section').evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(height < 300, `empty state should be compact, was ${height}px`);
    await b.getByRole('button', { name: 'Gestionar en Botes' }).click();
    await expect(b).toHaveURL(/\/admin\/boats$/);
  } finally { await empty.browser.close(); }
});

test('Configuración: a draft shows the Borrador badge with its hint, and delete is a compact card', async () => {
  const f = await fixture({ publicationStatus: 'draft' }); const { page } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    const visibility = page.locator('.admin-tour-config-row');
    await expect(visibility.locator('.admin-badge')).toHaveText('Borrador');
    await expect(visibility).toContainText('No aparece en el sitio público ni puede reservarse.');
    await expect(visibility.getByRole('button', { name: 'Mostrar tour' })).toBeVisible();
    const danger = page.locator('.admin-tour-danger');
    await expect(danger).toContainText('Esta acción no se puede deshacer.');
    const height = await danger.evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(height < 110, `delete card should be compact, was ${height}px`);
    // Delete still goes through the explicit confirmation dialog.
    await danger.getByRole('button', { name: 'Eliminar tour' }).click();
    await expect(page.getByRole('heading', { name: 'Eliminar tour' })).toBeVisible();
  } finally { await f.browser.close(); }
});

// --- ORDEN: sort_order assignment and normalization -----------------------------------

test('a new tour gets max(sort_order)+1, not tours.length+1 — safe across gaps left by deletions', async () => {
  // 3 rows but a gap at sort_order 3 (as if a 4th tour there had been deleted): count+1
  // would wrongly reuse 4 (colliding with the existing row); max+1 correctly gives 5.
  const tours = [
    { id: 'tour-1', title: 'Tour A', slug: 'tour-a', description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 1, highlights: [], included: [] },
    { id: 'tour-2', title: 'Tour B', slug: 'tour-b', description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 2, highlights: [], included: [] },
    { id: 'tour-3', title: 'Tour C', slug: 'tour-c', description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 4, highlights: [], included: [] },
  ];
  const f = await fixture({ tours }); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByLabel('Nombre del tour').fill('Tour nuevo');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Galería');
    assert.equal(posts(writes).length, 1);
    assert.equal(posts(writes)[0].body.sort_order, 5);
  } finally { await f.browser.close(); }
});

test('two tours created one after another never receive the same sort_order', async () => {
  const f = await fixture(); const { page, writes } = f; // starts with 1 tour at sort_order 1
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByLabel('Nombre del tour').fill('Tour A');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Galería');
    await page.getByRole('button', { name: 'Cerrar editor' }).click();
    await expect(page.locator('.admin-tour-modal')).toHaveCount(0);

    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByLabel('Nombre del tour').fill('Tour B');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Galería');

    assert.equal(posts(writes).length, 2);
    const [a, b] = posts(writes).map((w) => w.body.sort_order);
    assert.notEqual(a, b, `both tours got sort_order ${a}`);
    assert.equal(b, a + 1);
  } finally { await f.browser.close(); }
});

test('Guardar orden always persists exactly 1..N for the tours list, regardless of the starting values', async () => {
  // Mirrors the real duplicate found in production: two tours tied at sort_order 9, one gap.
  const tours = [
    { id: 'tour-1', title: 'Tour A', slug: 'tour-a', description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 9, highlights: [], included: [] },
    { id: 'tour-2', title: 'Tour B', slug: 'tour-b', description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 9, highlights: [], included: [] },
    { id: 'tour-3', title: 'Tour C', slug: 'tour-c', description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 1, highlights: [], included: [] },
  ];
  const f = await fixture({ tours }); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Reordenar' }).click();
    await expect(page.locator('tr.admin-sortable-row')).toHaveCount(3);
    await page.getByRole('button', { name: 'Guardar orden' }).click();
    await expect.poll(() => patches(writes).length).toBeGreaterThanOrEqual(3);
    const written = patches(writes).map((w) => w.body.sort_order).sort((a, b) => a - b);
    assert.deepEqual(written, [1, 2, 3]);
    assert.equal(new Set(written).size, 3, 'no duplicate sort_order after saving the order');
  } finally { await f.browser.close(); }
});

test('order survives a reload after saving', async () => {
  const tours = [
    { id: 'tour-1', title: 'Tour A', slug: 'tour-a', description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 3, highlights: [], included: [] },
    { id: 'tour-2', title: 'Tour B', slug: 'tour-b', description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 1, highlights: [], included: [] },
    { id: 'tour-3', title: 'Tour C', slug: 'tour-c', description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: 2, highlights: [], included: [] },
  ];
  const f = await fixture({ tours }); const { page } = f;
  try {
    await page.getByRole('button', { name: 'Reordenar' }).click();
    await page.getByRole('button', { name: 'Guardar orden' }).click();
    await expect(page.getByRole('button', { name: 'Reordenar' })).toBeVisible();

    await page.reload();
    const orderCells = page.locator('.admin-table tbody tr td:nth-child(4)');
    await expect(orderCells).toHaveText(['1', '2', '3']);
    // Same visual order (by title) as right before the reload — the list orders by sort_order.
    await expect(page.locator('.admin-table tbody tr td:first-child')).toContainText(['Tour B', 'Tour C', 'Tour A']);
  } finally { await f.browser.close(); }
});

// --- PUBLICACIÓN: shared validation for "Mostrar tour" and "Guardar" ------------------

test('publishing without a name is blocked, with an inline error and focus on step 1', async () => {
  const tours = [{ id: 'tour-1', title: '', slug: 'tour-1', description: '', long_description: '', category: 'Fishing', publication_status: 'draft', active: false, featured: false, sort_order: 1, highlights: [], included: [] }];
  const f = await fixture({ tours, imageCount: 3 }); const { page, writes } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: 'Mostrar tour' }).click();
    await expect(activeStep(page)).toContainText('Información');
    await expect(page.locator('#tour-title-error')).toHaveText('El nombre del tour es obligatorio.');
    await expect(page.locator('#tour-title')).toBeFocused();
    assert.equal(patches(writes).filter((w) => w.body.publication_status === 'published').length, 0);
  } finally { await f.browser.close(); }
});

test('publishing with a name but fewer than 3 photos is blocked and points to Galería', async () => {
  const tours = [{ id: 'tour-1', title: 'Tour incompleto', slug: 'tour-1', description: '', long_description: '', category: 'Fishing', publication_status: 'draft', active: false, featured: false, sort_order: 1, highlights: [], included: [] }];
  const f = await fixture({ tours, imageCount: 2 }); const { page, writes } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: 'Mostrar tour' }).click();
    await expect(activeStep(page)).toContainText('Galería');
    await expect(page.locator('.admin-gallery-error')).toHaveText('Agrega al menos 3 fotos para publicar el tour.');
    assert.equal(patches(writes).filter((w) => w.body.publication_status === 'published').length, 0);
  } finally { await f.browser.close(); }
});

test('publishing with a name and 3+ photos succeeds', async () => {
  const tours = [{ id: 'tour-1', title: 'Tour completo', slug: 'tour-1', description: '', long_description: '', category: 'Fishing', publication_status: 'draft', active: false, featured: false, sort_order: 1, highlights: [], included: [] }];
  const f = await fixture({ tours, imageCount: 3 }); const { page, writes } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: 'Mostrar tour' }).click();
    await expect.poll(() => patches(writes).filter((w) => w.body.publication_status === 'published').length).toBeGreaterThan(0);
    // The wizard stays open after toggling (unlike Guardar borrador/Guardar); the visible
    // confirmation is the Configuración step itself flipping to the published state.
    await expect(page.getByRole('button', { name: 'Ocultar tour' })).toBeVisible();
    await expect(page.locator('.admin-tour-config-row .admin-badge')).toHaveText('Activo');
  } finally { await f.browser.close(); }
});

test('Guardar borrador does not require 3 photos and never publishes', async () => {
  const f = await fixture({ imageCount: 0 }); const { page, writes } = f;
  try {
    await openExisting(page);
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.locator('.admin-tour-modal')).toHaveCount(0);
    assert.equal(patches(writes).filter((w) => w.body.publication_status === 'published').length, 0);
    assert.ok(patches(writes).some((w) => w.body.publication_status === 'draft'));
  } finally { await f.browser.close(); }
});

test('"Mostrar tour" and "Guardar" (Paso 5 final save) enforce the exact same validation', async () => {
  const tours = [{ id: 'tour-1', title: 'Tour a medias', slug: 'tour-1', description: '', long_description: '', category: 'Fishing', publication_status: 'draft', active: false, featured: false, sort_order: 1, highlights: [], included: [] }];

  const viaToggle = await fixture({ tours, imageCount: 1 }); const a = viaToggle.page;
  let toggleError;
  try {
    await openExisting(a);
    await a.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await a.getByRole('button', { name: 'Mostrar tour' }).click();
    toggleError = await a.locator('.admin-gallery-error').innerText();
    assert.equal(patches(viaToggle.writes).filter((w) => w.body.publication_status === 'published').length, 0);
  } finally { await viaToggle.browser.close(); }

  const viaFinal = await fixture({ tours, imageCount: 1 }); const b = viaFinal.page;
  let finalError;
  try {
    await openExisting(b);
    const next = b.getByRole('button', { name: 'Siguiente', exact: true });
    await next.click(); await next.click(); await next.click(); await next.click();
    await expect(activeStep(b)).toContainText('Configuración');
    await b.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(activeStep(b)).toContainText('Galería');
    finalError = await b.locator('.admin-gallery-error').innerText();
    assert.equal(patches(viaFinal.writes).filter((w) => w.body.publication_status === 'published').length, 0);
  } finally { await viaFinal.browser.close(); }

  assert.equal(toggleError, finalError);
  assert.equal(toggleError, 'Agrega al menos 3 fotos para publicar el tour.');
});
