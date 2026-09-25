// Focused coverage for the Tours wizard UX pass: a new tour starts with an
// empty (required) name, the 5-step stepper stays on one row, prev/next are
// icon-only with accessible names, and the Experiencia lists render as
// chips without layout overlap. Same mock-fixture pattern as the other admin
// tests — nothing here talks to a real Supabase project.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { makePng } from './support/png.mjs';
import { mockTranslation, SPANISH_ERROR } from './support/translation-mock.mjs';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

async function fixture({ publicationStatus = 'published', slowCreate = 0, tours: toursOverride, imageCount = 0, uploadFails = false, imageUpdateFails = false, deleteStatus = 200 } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const writes = [];
  // Ordered log of DB writes and Storage calls, to prove "new file saved first, old file deleted last".
  const events = [];
  const storage = [];
  const defaultTours = [{ id: 'tour-1', title: 'Fishing Tour', slug: 'fishing-tour', description: 'Half day', long_description: '', category: 'Fishing', publication_status: publicationStatus, active: publicationStatus === 'published', featured: false, sort_order: 1, highlights: ['Pesca deportiva'], included: [] }];
  const state = { tours: toursOverride ?? defaultTours };
  const imagesTourId = state.tours[0].id;
  const boats = [{ id: 'boat-1', name: 'Second Wind', max_guests: 8, active: true, sort_order: 1 }, { id: 'boat-2', name: 'Costa del Sol Boat', max_guests: 10, active: true, sort_order: 2 }];
  const relations = [{ id: 'l1', boat_id: 'boat-1', tour_id: imagesTourId, active: true, sort_order: 1 }];
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
        writes.push({ table: 'tours', method, body, translatedBefore: translation.calls.length });
        state.tours.push(body);
        return route.fulfill({ json: body });
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        writes.push({ table: 'tours', method, id });
        state.tours = state.tours.filter((tour) => tour.id !== id);
        return route.fulfill({ json: [] });
      }
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        const id = url.searchParams.get('id')?.replace('eq.', '');
        writes.push({ table: 'tours', method, body, id, translatedBefore: translation.calls.length }); events.push('PATCH:tours');
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
    if (path.endsWith('/storage-upload-image')) {
      storage.push({ kind: 'upload' }); events.push('upload');
      if (uploadFails) return route.fulfill({ status: 500, json: { message: 'Upload failed on purpose' } });
      const name = `new-${storage.length}`;
      return route.fulfill({ json: { image_url: `https://cdn.test/tours/tour-1/${name}.webp`, public_url: `https://cdn.test/tours/tour-1/${name}.webp`, image_public_id: `tours/tour-1/${name}.webp`, storage_bucket: 'site-images', storage_path: `tours/tour-1/${name}.webp`, mime_type: 'image/webp', size_bytes: 1234, width: 96, height: 54 } });
    }
    if (path.endsWith('/storage-delete-image')) {
      const body = request.postDataJSON(); storage.push({ kind: 'delete', body }); events.push(`delete:${body.storagePath}`);
      return route.fulfill(deleteStatus === 200 ? { json: {} } : { status: deleteStatus, json: { message: deleteStatus === 409 ? 'Image is still referenced by one or more resources' : 'Storage delete failed' } });
    }
    if (path.endsWith('/tour_images')) {
      if (method === 'PATCH') {
        const body = request.postDataJSON(); const id = url.searchParams.get('id')?.replace('eq.', '');
        writes.push({ table: 'tour_images', method, body, id }); events.push('PATCH:tour_images');
        if (imageUpdateFails) return route.fulfill({ status: 400, json: { message: 'No se pudo actualizar la foto (test)' } });
        const index = images.findIndex((image) => image.id === id);
        if (index >= 0) { images[index] = { ...images[index], ...body }; return route.fulfill({ json: request.headers().accept?.includes('vnd.pgrst.object') ? images[index] : [images[index]] }); }
        return route.fulfill({ json: [] });
      }
      if (method !== 'GET' && method !== 'HEAD') { writes.push({ table: 'tour_images', method, body: request.postDataJSON() }); return route.fulfill({ json: [] }); }
      return route.fulfill({ json: images });
    }
    if (method !== 'GET' && method !== 'HEAD') { writes.push({ table: path.split('/').pop(), method, body: request.postDataJSON() }); return route.fulfill({ json: [] }); }
    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });

  // Registered after the catch-all route above so it takes precedence for translate-texts.
  const translation = await mockTranslation(page);
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  await page.goto(`${base}/admin/tours`);
  return { browser, page, writes, events, storage, images, translation };
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
    await page.getByRole('button', { name: 'Cerrar editor' }).click();
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
    // Jump straight to Experiencia from step 1 with the stepper: it must create the row first.
    await page.locator('.admin-stepper').getByRole('button', { name: 'Experiencia' }).click();
    await expect(activeStep(page)).toContainText('Experiencia');
    assert.equal(posts(writes).length, 1);
    const next = page.getByRole('button', { name: 'Siguiente', exact: true });
    const prev = page.getByRole('button', { name: 'Anterior', exact: true });
    await next.click();
    await expect(activeStep(page)).toContainText('Configuración');
    for (const label of ['Experiencia', 'Galería']) {
      await prev.click();
      await expect(activeStep(page)).toContainText(label);
    }
    await page.locator('.admin-stepper').getByRole('button', { name: 'Información' }).click();
    for (const label of ['Galería', 'Experiencia']) {
      await next.click();
      await expect(activeStep(page)).toContainText(label);
    }
    assert.equal(posts(writes).length, 1);
  } finally { await f.browser.close(); }
});

test('editing an existing tour never inserts a new one', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await openExisting(page);
    await expect(page.getByRole('heading', { name: 'Fishing Tour' })).toBeVisible();
    const next = page.getByRole('button', { name: 'Siguiente', exact: true });
    for (const label of ['Galería', 'Experiencia', 'Configuración']) {
      await next.click();
      await expect(activeStep(page)).toContainText(label);
    }
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

test('the stepper has 4 steps (no Paquetes) on a single row on desktop, and Configuración is step 4', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openExisting(page);
    await expect(page.locator('.admin-stepper > li')).toHaveCount(4);
    await expect(page.locator('.admin-stepper > li strong')).toHaveText(['Información', 'Galería', 'Experiencia', 'Configuración']);
    await expect(page.locator('.admin-stepper').getByRole('button', { name: /Paquetes/ })).toHaveCount(0);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await expect(page.getByText('4 de 4 · Configuración')).toBeVisible();
    await page.locator('.admin-stepper').getByRole('button', { name: 'Información' }).click();
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
    await expect(prev).toHaveCount(0); // nothing to go back to on step 1
    assert.equal((await next.innerText()).trim(), '');
    await expect(next).toHaveAttribute('aria-label', 'Siguiente');
    for (const label of ['Galería', 'Experiencia', 'Configuración']) {
      await next.click();
      await expect(activeStep(page)).toContainText(label);
    }
    await expect(prev).toHaveAttribute('aria-label', 'Anterior');
    assert.equal((await prev.innerText()).trim(), '');
    // Last step: [←] [Guardar], no "Siguiente".
    await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible();
    await expect(prev).toBeEnabled();
    await prev.click();
    await expect(activeStep(page)).toContainText('Experiencia');
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

test('the Tours wizard has no packages step or package links: packages live in Botes > Tours y paquetes', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openExisting(page);
    for (const label of ['Galería', 'Experiencia', 'Configuración']) {
      await page.locator('.admin-stepper').getByRole('button', { name: label }).click();
      await expect(activeStep(page)).toContainText(label);
    }
    await expect(page.getByText('Gestionar en Botes')).toHaveCount(0);
    await expect(page.getByText('Editar en Botes')).toHaveCount(0);
    await expect(page.getByText('Los paquetes y precios se administran por bote')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

test('Configuración: a draft shows the Borrador badge with its hint, and delete is part of one compact card', async () => {
  const f = await fixture({ publicationStatus: 'draft' }); const { page } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    const visibility = page.locator('.admin-tour-config-row');
    await expect(visibility.locator('.admin-badge')).toHaveText('Borrador');
    await expect(visibility).toContainText('No aparece en el sitio público ni puede reservarse.');
    await expect(visibility.getByRole('button', { name: 'Mostrar tour' })).toBeVisible();
    const danger = page.locator('.admin-tour-danger-row');
    await expect(danger).toContainText('Esta acción elimina el tour y su información asociada. No se puede deshacer.');
    const height = await page.locator('.admin-tour-step-body .admin-form-section').evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(height < 330, `the single Configuración card should be compact, was ${height}px`);
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
    for (const label of ['Galería', 'Experiencia', 'Configuración']) {
      await next.click();
      await expect(activeStep(b)).toContainText(label);
    }
    await b.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(activeStep(b)).toContainText('Galería');
    finalError = await b.locator('.admin-gallery-error').innerText();
    assert.equal(patches(viaFinal.writes).filter((w) => w.body.publication_status === 'published').length, 0);
  } finally { await viaFinal.browser.close(); }

  assert.equal(toggleError, finalError);
  assert.equal(toggleError, 'Agrega al menos 3 fotos para publicar el tour.');
});

test('deleting a tour renumbers the remaining ones 1..N automatically (no hole left behind)', async () => {
  const mk = (id, order) => ({ id, title: id, slug: id, description: '', long_description: '', category: 'Fishing', publication_status: 'published', active: true, featured: false, sort_order: order, highlights: [], included: [] });
  // 1..3 then 9: the exact shape found in production (a hole where a deleted tour used to be).
  const f = await fixture({ tours: [mk('t1', 1), mk('t2', 2), mk('t3', 3), mk('t9', 9)] }); const { page, writes } = f;
  try {
    await page.getByRole('button', { name: 'Editar tour t2' }).click();
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await page.locator('.admin-tour-danger-row').getByRole('button', { name: 'Eliminar tour' }).click();
    await page.locator('.admin-modal-card').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page.locator('.admin-tour-modal')).toHaveCount(0);
    await expect(page.locator('.admin-table tbody tr td:nth-child(4)')).toHaveText(['1', '2', '3']);
    assert.deepEqual(writes.filter((w) => w.method === 'DELETE').map((w) => w.id), ['t2']);
    // Only rows whose number changed are written: t1 stays 1, t3 -> 2, t9 -> 3.
    assert.deepEqual(patches(writes).map((w) => [w.id, w.body.sort_order]), [['t3', 2], ['t9', 3]]);
  } finally { await f.browser.close(); }
});

// --- Footer + Configuración redesign ---------------------------------------------------------

const footerButtons = (page) => page.locator('.admin-wizard-footer button').evaluateAll((buttons) => buttons.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()));

test('footer: no Cancelar (the X closes), navigation on the left, save actions on the right, per step', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openExisting(page);
    await expect(page.getByRole('button', { name: 'Cerrar editor' })).toBeVisible();
    const expected = [
      ['Guardar borrador', 'Siguiente'],
      ['Anterior', 'Guardar borrador', 'Siguiente'],
      ['Anterior', 'Guardar borrador', 'Siguiente'],
      ['Anterior', 'Guardar borrador', 'Guardar'],
    ];
    for (const [index, label] of ['Información', 'Galería', 'Experiencia', 'Configuración'].entries()) {
      await page.locator('.admin-stepper').getByRole('button', { name: label }).click();
      await expect(activeStep(page)).toContainText(label);
      assert.deepEqual(await footerButtons(page), expected[index], `footer at step ${index + 1}`);
      await expect(page.locator('.admin-modal-footer').getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
    }
    // Guardar only on the last step; the X still closes the wizard.
    await page.getByRole('button', { name: 'Cerrar editor' }).click();
    await expect(page.locator('.admin-tour-modal')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

test('footer hierarchy: Anterior is a quiet icon, Guardar borrador is secondary, Guardar is the primary action', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    const prev = page.getByRole('button', { name: 'Anterior', exact: true });
    const draft = page.getByRole('button', { name: 'Guardar borrador' });
    const save = page.getByRole('button', { name: 'Guardar', exact: true });
    await expect(prev).toHaveAttribute('title', 'Anterior');
    await expect(prev).toHaveClass(/admin-btn--ghost/);
    await expect(draft).toHaveClass(/admin-btn--secondary/);
    await expect(save).not.toHaveClass(/admin-btn--(secondary|ghost)/);
    const [draftBg, saveBg] = await Promise.all([draft, save].map((b) => b.evaluate((el) => getComputedStyle(el).backgroundColor)));
    assert.notEqual(draftBg, saveBg, 'Guardar must be visually distinct from Guardar borrador');
    // Layout: [←] on the left, [Guardar borrador] [Guardar] on the right, nothing overlapping.
    const [p, d, g, bar] = await Promise.all([prev, draft, save, page.locator('.admin-wizard-footer')].map((l) => l.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; })));
    assert.ok(p.right < d.left - 24, 'navigation is separated from the save actions');
    assert.ok(d.right <= g.left, 'Guardar borrador sits before Guardar');
    assert.ok(g.right <= bar.right && p.left >= bar.left);
  } finally { await f.browser.close(); }
});

test('footer on a phone: navigation and save actions keep their order without overlapping', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    const boxes = await page.locator('.admin-wizard-footer button').evaluateAll((buttons) => buttons.map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
    const bar = await page.locator('.admin-wizard-footer').evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right }; });
    assert.equal(boxes.length, 3);
    for (const [i, a] of boxes.entries()) {
      assert.ok(a.l >= bar.l && a.r <= bar.r, `button ${i} inside the footer`);
      for (const b of boxes.slice(i + 1)) assert.ok(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t, 'buttons must not overlap');
    }
    assert.ok(boxes[0].l < boxes[1].l && boxes[1].l < boxes[2].l, 'order: Anterior, Guardar borrador, Guardar');
  } finally { await f.browser.close(); }
});

test('Configuración is ONE card: "Estado y visibilidad" with the delete section inside; no "Zona de peligro", plain-language copy', async () => {
  const f = await fixture({ publicationStatus: 'draft', imageCount: 3 }); const { page } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    const cards = page.locator('.admin-tour-step-body .admin-form-section');
    await expect(cards).toHaveCount(1);
    await expect(cards.getByRole('heading', { name: 'Estado y visibilidad' })).toBeVisible();
    await expect(cards).toContainText('Controla si este tour aparece en el sitio público.');
    await expect(page.getByText('Zona de peligro')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Eliminar tour' })).toHaveCount(0); // a title inside the card, not a section heading
    const danger = cards.locator('.admin-tour-danger-row');
    await expect(danger.locator('strong')).toHaveText('Eliminar tour');
    await expect(danger).toContainText('Esta acción elimina el tour y su información asociada. No se puede deshacer.');
    // The delete section sits after the visibility action, inside the same card, below a separator.
    const order = await cards.evaluate((el) => { const q = (sel) => el.querySelector(sel).getBoundingClientRect().top; return [q('.admin-tour-config-row'), q('.admin-tour-config-divider'), q('.admin-tour-danger-row')]; });
    assert.ok(order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
    // No decorative trash icon beside the section: the only trash is the small one inside the button.
    await expect(cards.locator('.admin-form-section__icon svg')).toHaveClass(/lucide-settings/);
    await expect(danger.locator('svg')).toHaveCount(1);
    await expect(danger.locator('button svg')).toHaveCount(1);
    await expect(danger.locator('button')).toHaveClass(/admin-btn--danger/);
    // No technical wording anywhere in the step or in the delete confirmation.
    const technical = /base de datos|paquetes asociados|reservas hist|FK|constraint|PostgreSQL/i;
    await expect(page.locator('.admin-tour-step-body')).not.toContainText(technical);
    await danger.getByRole('button', { name: 'Eliminar tour' }).click();
    await expect(page.getByRole('heading', { name: 'Eliminar tour' })).toBeVisible();
    await expect(page.locator('.admin-modal-card')).not.toContainText(/base de datos|FK|constraint|PostgreSQL/i);
  } finally { await f.browser.close(); }
});

test('the visibility button icon is the action: Mostrar tour -> Eye, Ocultar tour -> EyeOff', async () => {
  const draft = await fixture({ publicationStatus: 'draft', imageCount: 3 });
  try {
    await openExisting(draft.page);
    await draft.page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    const show = draft.page.getByRole('button', { name: 'Mostrar tour' });
    await expect(show.locator('svg')).toHaveClass(/lucide-eye(?!-off)/);
    await expect(show.locator('svg')).not.toHaveClass(/lucide-eye-off/);
  } finally { await draft.browser.close(); }

  const active = await fixture({ publicationStatus: 'published' });
  try {
    await openExisting(active.page);
    await active.page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    const hide = active.page.getByRole('button', { name: 'Ocultar tour' });
    await expect(hide.locator('svg')).toHaveClass(/lucide-eye-off/);
  } finally { await active.browser.close(); }
});

test('Galería only says "Mínimo 3 imágenes para continuar." (no "Para finalizar", no "Máximo 6")', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Galería' }).click();
    await expect(activeStep(page)).toContainText('Galería');
    await expect(page.locator('.admin-form-section__description')).toHaveText('Mínimo 3 imágenes para continuar.');
    await expect(page.locator('.admin-tour-step-body')).not.toContainText('Para finalizar');
    await expect(page.locator('.admin-tour-step-body')).not.toContainText('Máximo 6');
  } finally { await f.browser.close(); }
});

test('"Requisitos pendientes" appears only when something is missing; complete drafts say "Listo para publicar."; active tours show neither', async () => {
  const draftTours = [{ id: 'tour-1', title: 'Tour a medias', slug: 'tour-1', description: '', long_description: '', category: 'Fishing', publication_status: 'draft', active: false, featured: false, sort_order: 1, highlights: [], included: [] }];
  const missing = await fixture({ tours: draftTours, imageCount: 1 });
  try {
    await openExisting(missing.page);
    await missing.page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    const block = missing.page.locator('.admin-tour-missing');
    await expect(block).toContainText('Requisitos pendientes');
    await expect(block.getByRole('listitem')).toHaveText(['Al menos 3 fotos']); // the name is filled in, so only photos are missing
    await expect(missing.page.getByText('Listo para publicar.')).toHaveCount(0);
  } finally { await missing.browser.close(); }

  const ready = await fixture({ tours: draftTours, imageCount: 3 });
  try {
    await openExisting(ready.page);
    await ready.page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await expect(ready.page.locator('.admin-tour-missing')).toHaveCount(0);
    await expect(ready.page.getByText('Requisitos pendientes')).toHaveCount(0);
    await expect(ready.page.getByText('Listo para publicar.')).toBeVisible();
  } finally { await ready.browser.close(); }

  const active = await fixture({ imageCount: 0 }); // published, even with no photos in this mock: never nags
  try {
    await openExisting(active.page);
    await active.page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await expect(active.page.locator('.admin-tour-config-row .admin-badge')).toHaveText('Activo');
    await expect(active.page.getByText('Visible en el sitio público y disponible para reservas.')).toBeVisible();
    await expect(active.page.getByRole('button', { name: 'Ocultar tour' })).toBeVisible();
    await expect(active.page.getByText('Requisitos pendientes')).toHaveCount(0);
    await expect(active.page.getByText('Listo para publicar.')).toHaveCount(0);
  } finally { await active.browser.close(); }
});

test('Configuración layout: both action buttons share the right edge and width; on a phone everything stacks with full-width buttons', async () => {
  const f = await fixture({ publicationStatus: 'draft', imageCount: 1 }); const { page } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    const measure = () => page.evaluate(() => {
      const card = document.querySelector('.admin-tour-step-body .admin-form-section').getBoundingClientRect();
      const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; };
      return { card: { l: card.left, r: card.right, h: card.height }, status: box('.admin-tour-config-row__status'), toggle: box('.admin-tour-config-row .admin-btn'), del: box('.admin-tour-danger-row .admin-btn'), divider: box('.admin-tour-config-divider') };
    });
    const d = await measure();
    assert.ok(Math.abs(d.toggle.r - d.del.r) < 1 && Math.abs(d.toggle.w - d.del.w) < 1, 'Mostrar/Ocultar and Eliminar share right edge and width');
    assert.ok(d.toggle.t - d.status.t < 24, 'the toggle aligns with the top of the status block (not floating in the middle)');
    assert.ok(d.toggle.l > d.status.r - 1 && d.card.r - d.toggle.r < 40, 'the button sits at the right of the card, next to the status');
    assert.ok(d.divider.t > d.status.b && d.card.h < 340, 'divider below the status block and the card stays compact');

    await page.setViewportSize({ width: 390, height: 844 });
    const m = await measure();
    assert.ok(m.toggle.t >= m.status.b - 1 && m.del.t > m.divider.b, 'stacked: status, action, divider, delete');
    assert.ok(m.toggle.w > 250 && Math.abs(m.toggle.w - m.del.w) < 1, 'full-width buttons');
  } finally { await f.browser.close(); }
});

// --- Galería: replacing a photo never orphans (or loses) files in Storage ---------------------------------

async function replaceTourPhoto(page) {
  await openExisting(page);
  await page.locator('.admin-stepper').getByRole('button', { name: 'Galería' }).click();
  await expect(activeStep(page)).toContainText('Galería');
  await page.getByRole('button', { name: 'Cambiar foto 1' }).click();
  await page.locator('input[type="file"][aria-label="Elegir archivo de imagen"]').setInputFiles({ name: 'nueva.png', mimeType: 'image/png', buffer: makePng() });
  const go = page.getByRole('button', { name: 'Continuar y subir' });
  await expect(go).toBeEnabled({ timeout: 15000 });
  await go.click();
}

test('tour gallery: replacing a photo deletes the old file only after the new file and the references are saved', async () => {
  const f = await fixture({ imageCount: 3 }); const { page, storage, events, images } = f;
  try {
    await replaceTourPhoto(page);
    await expect.poll(() => storage.filter((call) => call.kind === 'delete').length).toBe(1);
    const order = events.filter((event) => ['upload', 'PATCH:tour_images', 'PATCH:tours'].includes(event) || event.startsWith('delete:'));
    assert.equal(order[0], 'upload');
    assert.ok(order.indexOf('PATCH:tour_images') > 0);
    assert.equal(order.at(-1), 'delete:p1', JSON.stringify(order));
    assert.deepEqual(storage.find((call) => call.kind === 'delete').body, { storagePath: 'p1', resourceTable: 'tour_images', resourceId: 'img1' });
    assert.equal(images[0].storage_path, 'tours/tour-1/new-1.webp');
    assert.deepEqual(images.slice(1).map((image) => image.storage_path), ['p2', 'p3']);
  } finally { await f.browser.close(); }
});

test('tour gallery: a failed upload or a failed reference update keeps the previous photo', async () => {
  const noUpload = await fixture({ imageCount: 3, uploadFails: true });
  try {
    await replaceTourPhoto(noUpload.page);
    await expect(noUpload.page.getByText('Upload failed on purpose')).toBeVisible();
    assert.deepEqual(noUpload.storage.map((call) => call.kind), ['upload']);
    assert.equal(noUpload.writes.some((w) => w.table === 'tour_images'), false);
    assert.equal(noUpload.images[0].storage_path, 'p1');
  } finally { await noUpload.browser.close(); }

  const noUpdate = await fixture({ imageCount: 3, imageUpdateFails: true });
  try {
    await replaceTourPhoto(noUpdate.page);
    await expect(noUpdate.page.getByText('No se pudo actualizar la foto (test)')).toBeVisible();
    assert.deepEqual(noUpdate.storage.filter((call) => call.kind === 'delete').map((call) => call.body.storagePath), ['tours/tour-1/new-1.webp'], 'only the new, unreferenced file may be removed');
    assert.equal(noUpdate.images[0].storage_path, 'p1');
  } finally { await noUpdate.browser.close(); }
});

test('tour gallery: when the old file cannot be deleted (still referenced) the replacement stays and the admin is told', async () => {
  const f = await fixture({ imageCount: 3, deleteStatus: 409 });
  try {
    await replaceTourPhoto(f.page);
    await expect(f.page.locator('.admin-tour-modal').getByText('La foto anterior no se pudo borrar del almacenamiento y quedó pendiente de limpieza.')).toBeVisible();
    assert.equal(f.images[0].storage_path, 'tours/tour-1/new-1.webp');
  } finally { await f.browser.close(); }
});

// --- Traducción: el admin escribe en inglés, DeepL genera el español (EN -> ES) antes de persistir ----------------------------
// Every persistence path of a tour (create, Siguiente, Guardar borrador, Guardar) translates first; DeepL is mocked.

const tourPatches = (writes) => writes.filter((w) => w.table === 'tours' && w.method === 'PATCH');
const inclusionWrites = (writes) => writes.filter((w) => w.table === 'tour_inclusions' && w.method === 'POST');

test('CREATE: the new tour is translated first and inserted already bilingual (one request for everything typed)', async () => {
  const f = await fixture(); const { page, writes, translation } = f;
  try {
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByLabel('Nombre del tour').fill('Sunset Cruise');
    await page.getByLabel('Frase').fill('Private cruise at sunset.');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Galería');
    assert.equal(translation.calls.length, 1, 'title + phrase go out together, and only once');
    assert.deepEqual(translation.calls[0], { texts: ['Sunset Cruise', 'Private cruise at sunset.'], targetLang: 'ES', sourceLang: 'EN' });
    const insert = posts(writes)[0];
    assert.equal(insert.translatedBefore, 1, 'the translation happened BEFORE the insert');
    assert.deepEqual([insert.body.title, insert.body.title_en, insert.body.title_es], ['Sunset Cruise', 'Sunset Cruise', 'Sunset Cruise [ES]']);
    assert.deepEqual([insert.body.description, insert.body.description_en, insert.body.description_es], ['Private cruise at sunset.', 'Private cruise at sunset.', 'Private cruise at sunset. [ES]']);
    // The follow-up persist of Información has nothing new to translate.
    assert.equal(tourPatches(writes).every((w) => !('title_es' in w.body) && !('description_es' in w.body)), true);
  } finally { await f.browser.close(); }
});

test('CREATE: if DeepL fails the tour is not created, the error says "al español" and typing is kept', async () => {
  const f = await fixture(); const { page, writes, translation } = f;
  try {
    translation.fails = true;
    await page.getByRole('button', { name: 'Crear tour' }).click();
    await page.getByLabel('Nombre del tour').fill('Sunset Cruise');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: SPANISH_ERROR })).toBeVisible();
    await expect(activeStep(page)).toContainText('Información');
    assert.equal(posts(writes).length, 0);
    assert.equal(writes.length, 0);
    await expect(page.getByLabel('Nombre del tour')).toHaveValue('Sunset Cruise');
    translation.fails = false;
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Galería');
    assert.equal(posts(writes).length, 1);
    assert.equal(posts(writes)[0].body.title_es, 'Sunset Cruise [ES]');
  } finally { await f.browser.close(); }
});

test('NEXT (Información): only the changed English fields are translated; unchanged ones are not written or retranslated', async () => {
  const f = await fixture(); const { page, writes, translation } = f;
  try {
    await openExisting(page);
    // Untouched Siguiente: nothing to translate, no _es/_en column is written.
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Galería');
    assert.equal(translation.calls.length, 0);
    assert.equal(tourPatches(writes).every((w) => Object.keys(w.body).every((key) => !/_(es|en)$/.test(key))), true);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Información' }).click();
    // Edit only the long description.
    await page.getByLabel(/^Descripción/).fill('A relaxed half-day fishing trip with a local captain.');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Galería');
    assert.deepEqual(translation.calls.map((call) => call.texts), [['A relaxed half-day fishing trip with a local captain.']]);
    const patch = tourPatches(writes).at(-1);
    assert.equal(patch.translatedBefore, 1);
    assert.deepEqual([patch.body.long_description, patch.body.long_description_en, patch.body.long_description_es], ['A relaxed half-day fishing trip with a local captain.', 'A relaxed half-day fishing trip with a local captain.', 'A relaxed half-day fishing trip with a local captain. [ES]']);
    for (const key of ['title_es', 'title_en', 'description_es', 'description_en']) assert.equal(key in patch.body, false, `${key} must not be written when unchanged`);
    // Clearing a translated field clears both copies (a stale Spanish would keep showing on the landing).
    await page.locator('.admin-stepper').getByRole('button', { name: 'Información' }).click();
    await page.getByLabel(/^Descripción/).fill('');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect.poll(() => tourPatches(writes).length).toBeGreaterThan(2);
    const cleared = tourPatches(writes).at(-1).body;
    assert.deepEqual([cleared.long_description, cleared.long_description_en, cleared.long_description_es], [null, null, null]);
    assert.equal(translation.calls.length, 1);
  } finally { await f.browser.close(); }
});

test('NEXT (Experiencia): activities, Incluye and inclusion rows are translated together and stored as parallel EN/ES lists', async () => {
  const f = await fixture(); const { page, writes, translation } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Experiencia' }).click();
    await page.getByLabel('Actividades del tour', { exact: true }).fill('Sport fishing');
    await page.getByRole('button', { name: 'Agregar actividad' }).click();
    await page.getByLabel('Incluye', { exact: true }).fill('Drinks');
    await page.getByRole('button', { name: 'Agregar a incluye' }).click();
    await page.waitForTimeout(300);
    assert.equal(translation.calls.length, 0, 'nothing is translated while adding chips');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Configuración');
    assert.equal(translation.calls.length, 1);
    assert.deepEqual(translation.calls[0].texts.sort(), ['Drinks', 'Pesca deportiva', 'Sport fishing'].sort());
    const patch = tourPatches(writes).at(-1).body;
    assert.deepEqual(patch.highlights, ['Pesca deportiva', 'Sport fishing']);
    assert.deepEqual(patch.highlights_en, ['Pesca deportiva', 'Sport fishing']);
    assert.deepEqual(patch.highlights_es, ['Pesca deportiva [ES]', 'Sport fishing [ES]']);
    assert.deepEqual([patch.included, patch.included_en, patch.included_es], [['Drinks'], ['Drinks'], ['Drinks [ES]']]);
    const row = inclusionWrites(writes).at(-1).body;
    assert.deepEqual([row.label, row.label_en, row.label_es], ['Drinks', 'Drinks', 'Drinks [ES]']);
  } finally { await f.browser.close(); }
});

test('SAVE DRAFT and FINAL SAVE translate too; a DeepL failure persists nothing (not even the status)', async () => {
  const f = await fixture({ imageCount: 3 }); const { page, writes, translation } = f;
  try {
    await openExisting(page);
    await page.getByLabel('Frase').fill('Fishing trip with a local captain.');
    translation.fails = true;
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByRole('alert').filter({ hasText: SPANISH_ERROR })).toBeVisible();
    assert.equal(writes.length, 0, 'nothing is saved when the translation fails');
    await expect(page.locator('.admin-tour-modal')).toBeVisible();
    translation.fails = false;
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.locator('.admin-tour-modal')).toHaveCount(0);
    const draftPatch = tourPatches(writes).find((w) => 'description_es' in w.body);
    assert.deepEqual([draftPatch.body.description, draftPatch.body.description_en, draftPatch.body.description_es], ['Fishing trip with a local captain.', 'Fishing trip with a local captain.', 'Fishing trip with a local captain. [ES]']);
    assert.equal(draftPatch.translatedBefore >= 1, true);
    // Final save (Guardar on the last step).
    await openExisting(page);
    await page.getByLabel('Frase').fill('Fishing trip with a local captain and lunch.');
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    translation.fails = true;
    const before = writes.length;
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: SPANISH_ERROR })).toBeVisible();
    assert.equal(writes.slice(before).some((w) => w.body?.publication_status === 'published'), false, 'a failed translation never publishes');
    translation.fails = false;
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.locator('.admin-tour-modal')).toHaveCount(0);
    const finalPatches = tourPatches(writes).slice(before);
    assert.equal(finalPatches.some((w) => w.body.description_es === 'Fishing trip with a local captain and lunch. [ES]'), true);
    assert.equal(finalPatches.some((w) => w.body.publication_status === 'published'), true);
  } finally { await f.browser.close(); }
});

test('Mostrar / Ocultar tour never calls the translator (content was already translated when it was saved)', async () => {
  const f = await fixture({ publicationStatus: 'draft', imageCount: 3 }); const { page, translation } = f;
  try {
    await openExisting(page);
    await page.locator('.admin-stepper').getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: 'Mostrar tour' }).click();
    await expect(page.getByRole('button', { name: 'Ocultar tour' })).toBeVisible();
    assert.equal(translation.calls.length, 0);
  } finally { await f.browser.close(); }
});

test('Tour photos: the alt text is derived from the tour title (English) and its Spanish/English copies are cleared so the landing falls back to title_es / title_en', async () => {
  const f = await fixture({ imageCount: 3 }); const { page, writes } = f;
  try {
    await replaceTourPhoto(page);
    const altPatches = () => writes.filter((w) => w.table === 'tour_images' && w.method === 'PATCH' && 'alt_text' in w.body);
    await expect.poll(() => altPatches().length).toBeGreaterThan(0);
    for (const { body } of altPatches()) assert.deepEqual([body.alt_text, body.alt_text_en, body.alt_text_es], ['Fishing Tour photo 1', null, null]);
  } finally { await f.browser.close(); }
});
