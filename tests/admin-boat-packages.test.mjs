// Focused coverage for the Tours / Botes / Paquetes simplification:
//   Tour = experience, Boat = vessel; each boat decides which tours it offers and the
//   packages of each tour (packages belong to boat_tours, never directly to a tour or a boat).
// Packages are created/edited ONLY in Botes > Tours y paquetes; "Resumen de paquetes" is read-only.
// Same mock-fixture pattern as the other admin tests — nothing here talks to a real Supabase project.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { makePng } from './support/png.mjs';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

const eqRow = (id, boatId, es, en, order) => ({ id, boat_id: boatId, label: es ?? en, label_es: es, label_en: en, sort_order: order, active: true });
const imgRow = (id, boatId, order, extra = {}) => ({ id, boat_id: boatId, image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', storage_path: `boats/${boatId}/${id}.webp`, alt_text: `foto ${order}`, is_primary: order === 1, sort_order: order, active: true, pending_deletion: false, ...extra });
const threeImages = (boatId) => [imgRow('img1', boatId, 1), imgRow('img2', boatId, 2), imgRow('img3', boatId, 3)];

const boatRow = (id, name, order, extra = {}) => ({ id, slug: id, name, images: [], badge: null, length: null, engine: null, featured_spec: null, max_guests: 10, image_url: null, image_public_id: null, active: true, sort_order: order, ...extra });
const tourRow = (id, title, order, extra = {}) => ({ id, title, category: 'Fishing', publication_status: 'published', active: true, sort_order: order, ...extra });
const pkgRow = (id, link, name, price, order, extra = {}) => ({ id, boat_tour_id: link, name, package_type: 'half-day', description: null, duration_minutes: 240, base_price: price, included_guests: 5, max_guests: 10, extra_guest_price: 0, custom_quote: false, image_url: null, image_public_id: null, active: true, sort_order: order, departure_times: null, meal_options: [], package_included: null, ...extra });

async function fixture({ boats: boatsOverride, slowCreate = 0, images = [], extraTours = 0, uploadFails = false, imageUpdateFails = false, deleteStatus = 200, equipment = [], translate = {} } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.addInitScript(() => {
    window.__navs = [];
    const push = history.pushState.bind(history);
    history.pushState = (...args) => { window.__navs.push(String(args[2])); return push(...args); };
  });
  const writes = [];
  // Ordered log of writes AND storage calls, to prove "new file saved first, old file deleted last".
  const events = [];
  const storage = [];
  // DeepL is always mocked (translate-texts). `translate.fails` / `translate.empty` can be flipped mid-test.
  const translation = { fails: false, empty: false, ...translate };
  const translateCalls = [];
  const state = {
    images: images.map((image) => ({ ...image })),
    equipment: equipment.map((item) => ({ ...item })),
    boats: boatsOverride ?? [boatRow('second-wind', 'Second Wind', 1), boatRow('costa', 'Costa del Sol Boat', 2)],
    tours: [tourRow('fishing', 'Fishing Tour', 1), tourRow('water', 'Water Toys Tour', 2), tourRow('sunset', 'Sunset Cruise', 3, { publication_status: 'draft', active: false }), tourRow('surf', 'Surfing Tour', 4), ...Array.from({ length: extraTours }, (_, n) => tourRow(`extra-${n + 1}`, `Extra Tour ${n + 1}`, 5 + n))],
    links: [{ id: 'l1', boat_id: 'second-wind', tour_id: 'fishing', active: true, sort_order: 1 }, { id: 'l2', boat_id: 'second-wind', tour_id: 'water', active: false, sort_order: 2 }],
    // sort_order 1, 2 and 4 (a hole at 3, as left by a deleted package): count+1 would be 4 and collide.
    packages: [pkgRow('p1', 'l1', 'Half Day', 680, 1, { meal_options: [{ es: 'Casado con pescado', en: 'Fish casado' }, { es: 'Pasta con mariscos', en: 'Seafood pasta' }] }), pkgRow('p2', 'l1', '3/4 Day', 800, 2, { package_included: ['Drinks', 'Snacks'], package_included_en: ['Drinks', 'Snacks'], package_included_es: ['Bebidas', 'Snacks (viejo)'] }), pkgRow('p3', 'l1', 'Full Day', 1050, 4), pkgRow('p4', 'l2', 'Splash', 300, 1)],
  };
  const objectAccept = (request) => (request.headers().accept ?? '').includes('vnd.pgrst.object');

  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const q = (name) => url.searchParams.get(name)?.replace('eq.', '');
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });

    if (path.endsWith('/boats')) {
      if (method === 'POST') {
        if (slowCreate) await new Promise((resolve) => setTimeout(resolve, slowCreate));
        const body = request.postDataJSON(); writes.push({ table: 'boats', method, body });
        state.boats.push({ ...body }); return route.fulfill({ json: [] });
      }
      if (method === 'PATCH') { const body = request.postDataJSON(); writes.push({ table: 'boats', method, body, id: q('id') }); events.push('PATCH:boats'); state.boats = state.boats.map((b) => (b.id === q('id') ? { ...b, ...body } : b)); return route.fulfill({ json: [] }); }
      if (method === 'DELETE') { writes.push({ table: 'boats', method, id: q('id') }); state.boats = state.boats.filter((b) => b.id !== q('id')); return route.fulfill({ json: [] }); }
      if (url.searchParams.get('select') === 'sort_order') {
        const highest = [...state.boats].sort((a, b) => b.sort_order - a.sort_order)[0];
        return route.fulfill({ json: highest ? { sort_order: highest.sort_order } : null });
      }
      const sorted = [...state.boats].sort((a, b) => a.sort_order - b.sort_order);
      return route.fulfill({ json: objectAccept(request) ? sorted.find((b) => b.id === q('id')) ?? null : sorted });
    }
    if (path.endsWith('/tours')) return route.fulfill({ json: state.tours });
    if (path.endsWith('/boat_tours')) {
      if (method === 'POST') { const body = request.postDataJSON(); writes.push({ table: 'boat_tours', method, body }); const row = { id: `link-${state.links.length + 1}`, ...body }; state.links.push(row); return route.fulfill({ json: objectAccept(request) ? { id: row.id } : [{ id: row.id }] }); }
      if (method === 'PATCH') { const body = request.postDataJSON(); writes.push({ table: 'boat_tours', method, body, id: q('id') }); state.links = state.links.map((l) => (l.id === q('id') ? { ...l, ...body } : l)); return route.fulfill({ json: [] }); }
      let rows = state.links;
      if (q('boat_id')) rows = rows.filter((l) => l.boat_id === q('boat_id'));
      if (q('tour_id')) rows = rows.filter((l) => l.tour_id === q('tour_id'));
      return route.fulfill({ json: objectAccept(request) ? rows[0] ?? null : rows });
    }
    if (path.endsWith('/tour_packages')) {
      if (method === 'POST') {
        const body = request.postDataJSON(); writes.push({ table: 'tour_packages', method, body });
        state.packages = state.packages.some((p) => p.id === body.id) ? state.packages.map((p) => (p.id === body.id ? { ...p, ...body } : p)) : [...state.packages, body];
        return route.fulfill({ status: 201, body: '' });
      }
      if (method === 'PATCH') { const body = request.postDataJSON(); writes.push({ table: 'tour_packages', method, body, boatTourId: q('boat_tour_id') }); state.packages = state.packages.map((p) => (p.boat_tour_id === q('boat_tour_id') ? { ...p, ...body } : p)); return route.fulfill({ json: [] }); }
      if (method === 'DELETE') { writes.push({ table: 'tour_packages', method, id: q('id') }); state.packages = state.packages.filter((p) => p.id !== q('id')); return route.fulfill({ json: [] }); }
      if ((url.searchParams.get('select') ?? '').includes('boat_tours(')) {
        // Resumen de paquetes: rows joined with boat_tours -> boats/tours, with an exact count.
        const rows = state.packages.map((p) => { const link = state.links.find((l) => l.id === p.boat_tour_id); return { ...p, boat_tours: { boat_id: link.boat_id, tour_id: link.tour_id, boats: { name: state.boats.find((b) => b.id === link.boat_id)?.name }, tours: { title: state.tours.find((t) => t.id === link.tour_id)?.title, included: ['Life jacket and safety equipment'] } } }; });
        return route.fulfill({ json: rows, headers: { 'access-control-expose-headers': 'content-range', 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } });
      }
      return route.fulfill({ json: [...state.packages].sort((a, b) => a.sort_order - b.sort_order) });
    }
    if (path.endsWith('/translate-texts')) {
      const body = request.postDataJSON(); translateCalls.push(body); events.push('translate');
      if (translation.fails) return route.fulfill({ status: 502, json: { message: 'No se pudo traducir el texto. Intenta nuevamente.' } });
      if (translation.empty) return route.fulfill({ json: { translations: body.texts.map(() => '') } });
      // Same shape as the real function; the suffix shows which direction was requested.
      return route.fulfill({ json: { translations: body.texts.map((text) => `${text} [${body.targetLang}]`) } });
    }
    if (path.endsWith('/storage-upload-image')) {
      storage.push({ kind: 'upload' }); events.push('upload');
      if (uploadFails) return route.fulfill({ status: 500, json: { message: 'Upload failed on purpose' } });
      const name = `new-${storage.length}`;
      return route.fulfill({ json: { image_url: `https://cdn.test/boats/second-wind/${name}.webp`, public_url: `https://cdn.test/boats/second-wind/${name}.webp`, image_public_id: `boats/second-wind/${name}.webp`, storage_bucket: 'site-images', storage_path: `boats/second-wind/${name}.webp`, mime_type: 'image/webp', size_bytes: 1234, width: 96, height: 54 } });
    }
    if (path.endsWith('/storage-delete-image')) {
      const body = request.postDataJSON(); storage.push({ kind: 'delete', body }); events.push(`delete:${body.storagePath}`);
      return route.fulfill(deleteStatus === 200 ? { json: {} } : { status: deleteStatus, json: { message: deleteStatus === 409 ? 'Image is still referenced by one or more resources' : 'Storage delete failed' } });
    }
    if (path.endsWith('/boat_images')) {
      if (method === 'GET' || method === 'HEAD') {
        const boatFilter = url.searchParams.get('boat_id') ?? '';
        const wanted = boatFilter.startsWith('in.') ? boatFilter.slice(4, -1).split(',') : boatFilter ? [boatFilter.replace('eq.', '')] : null;
        const rows = state.images.filter((image) => (!wanted || wanted.includes(image.boat_id)) && (q('active') !== 'true' || image.active));
        return route.fulfill({ json: rows });
      }
      const body = method === 'DELETE' ? undefined : request.postDataJSON();
      writes.push({ table: 'boat_images', method, body, id: q('id') }); events.push(`${method}:boat_images`);
      if (method === 'PATCH') {
        if (imageUpdateFails) return route.fulfill({ status: 400, json: { message: 'No se pudo actualizar la foto (test)' } });
        state.images = state.images.map((image) => ((q('id') ? image.id === q('id') : image.boat_id === q('boat_id')) ? { ...image, ...body } : image));
        return route.fulfill({ json: [] });
      }
      if (method === 'POST') {
        const row = { id: `bi-new-${state.images.length + 1}`, ...body }; state.images.push(row);
        return route.fulfill({ status: 201, json: objectAccept(request) ? row : [row] });
      }
      return route.fulfill({ json: [] });
    }
    if (path.endsWith('/boat_equipment')) {
      if (method === 'GET' || method === 'HEAD') {
        const boatFilter = url.searchParams.get('boat_id') ?? '';
        const wanted = boatFilter.startsWith('in.') ? boatFilter.slice(4, -1).split(',') : boatFilter ? [boatFilter.replace('eq.', '')] : null;
        return route.fulfill({ json: state.equipment.filter((item) => !wanted || wanted.includes(item.boat_id)).sort((a, b) => a.sort_order - b.sort_order) });
      }
      const body = method === 'DELETE' ? undefined : request.postDataJSON();
      writes.push({ table: 'boat_equipment', method, body, id: q('id') }); events.push(`${method}:boat_equipment`);
      if (method === 'POST') state.equipment = state.equipment.some((item) => item.id === body.id) ? state.equipment.map((item) => (item.id === body.id ? { ...item, ...body } : item)) : [...state.equipment, { ...body }];
      if (method === 'DELETE') state.equipment = state.equipment.filter((item) => item.id !== q('id'));
      return route.fulfill({ status: method === 'POST' ? 201 : 200, json: [] });
    }
    if (path.endsWith('/time_slots')) {
      if (method !== 'GET' && method !== 'HEAD') { writes.push({ table: path.split('/').pop(), method, body: request.postDataJSON() }); }
      return route.fulfill({ json: [] });
    }
    if (method !== 'GET' && method !== 'HEAD') { writes.push({ table: path.split('/').pop(), method }); return route.fulfill({ json: [] }); }
    return route.fulfill({ json: [], headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/0' } });
  });

  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, writes, state, events, storage, translation, translateCalls };
}

const boatPosts = (writes) => writes.filter((w) => w.table === 'boats' && w.method === 'POST');
const activeStep = (page) => page.locator('.admin-stepper [aria-current="step"]');
const openSecondWind = async (page) => {
  await page.goto(`${base}/admin/boats`);
  await page.getByRole('button', { name: 'Editar bote Second Wind' }).click();
};
const goToStep = (page, label) => page.locator('.admin-stepper').getByRole('button', { name: label }).click();

// --- BOTES: wizard ------------------------------------------------------------------------

test('boat wizard: 4 steps — Información / Galería / Tours y paquetes / Configuración — each with its own content', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openSecondWind(page);
    await expect(page.locator('.admin-stepper > li strong')).toHaveText(['Información', 'Galería', 'Tours y paquetes', 'Configuración']);
    await expect(page.getByText('1 de 4 · Información')).toBeVisible();
    // The four steps sit on one row (same stepper as Tours).
    const tops = await page.locator('.admin-stepper > li').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1, `steps are not on one row: ${tops}`);

    // Información: identity, capacity/specs and equipment only — no photos, status or delete.
    for (const selector of ['#boat-name', '#boat-badge', '#boat-max-guests', '#boat-length', '#boat-engine']) await expect(page.locator(selector)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Información general' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Capacidad y especificaciones' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Equipamiento' })).toBeVisible();
    await expect(page.locator('.admin-tour-image-slots')).toHaveCount(0);
    await expect(page.getByText('Estado actual')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar bote' })).toHaveCount(0);

    // Galería: its own step, same slots as the Tours gallery.
    await goToStep(page, 'Galería');
    await expect(page.getByText('2 de 4 · Galería')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Galería' })).toBeVisible();
    await expect(page.locator('.admin-form-section__description')).toHaveText('Mínimo 3 imágenes para publicar el bote.');
    await expect(page.locator('.admin-tour-image-slots .admin-tour-image-slot')).toHaveCount(6);
    await expect(page.locator('#boat-name')).toHaveCount(0);

    // Tours y paquetes: the package editor, nothing about name/capacity.
    await goToStep(page, 'Tours y paquetes');
    await expect(page.getByRole('heading', { name: 'Tours y paquetes' })).toBeVisible();
    await expect(page.getByText('Selecciona los tours disponibles en este bote y configura sus paquetes.')).toBeVisible();
    await expect(page.locator('#boat-name')).toHaveCount(0);

    // Configuración: ONE card, same layout as Tours — state, position, delete — nothing from Información.
    await goToStep(page, 'Configuración');
    await expect(page.getByText('4 de 4 · Configuración')).toBeVisible();
    await expect(page.locator('.admin-boat-step-body .admin-form-section')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Estado y visibilidad' })).toBeVisible();
    await expect(page.getByText('Zona de peligro')).toHaveCount(0);
    await expect(page.getByText('Estado actual')).toBeVisible();
    await expect(page.getByText('Posición actual: 1. Puedes cambiarla usando Reordenar en la lista de Botes.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Eliminar bote' })).toBeVisible();
    await expect(page.locator('#boat-name')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

test('boat footer matches Tours: no Cancelar (the X closes), ← on the left, Guardar borrador + Siguiente/Guardar on the right', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openSecondWind(page);
    await expect(page.getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible();
    const names = () => page.locator('.admin-wizard-footer button').evaluateAll((buttons) => buttons.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()));
    const expected = [['Guardar borrador', 'Siguiente'], ['Anterior', 'Guardar borrador', 'Siguiente'], ['Anterior', 'Guardar borrador', 'Siguiente'], ['Anterior', 'Guardar borrador', 'Guardar']];
    for (const [index, label] of ['Información', 'Galería', 'Tours y paquetes', 'Configuración'].entries()) {
      await goToStep(page, label);
      await expect(activeStep(page)).toContainText(label);
      assert.deepEqual(await names(), expected[index], `footer at step ${index + 1}`);
      await expect(page.locator('.admin-modal-footer').getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
    }
    const prev = page.getByRole('button', { name: 'Anterior', exact: true });
    await expect(prev).toHaveAttribute('title', 'Anterior');
    assert.equal((await prev.innerText()).trim(), '');
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('.admin-boat-modal')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

test('boat name is required: inline error, nothing is created, no "Nuevo bote" default', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: 'Crear bote' }).click();
    await expect(page.locator('#boat-name')).toHaveValue('');
    await expect(page.getByText('Nuevo bote')).toHaveCount(0);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.locator('#boat-name-error')).toHaveText('El nombre del bote es obligatorio.');
    await expect(page.locator('#boat-name')).toBeFocused();
    await expect(activeStep(page)).toContainText('Información');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.locator('#boat-name-error')).toBeVisible();
    assert.equal(writes.length, 0);
  } finally { await f.browser.close(); }
});

test('closing with the X: never inserts a boat, and warns before discarding typed changes', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    const dialogs = [];
    let accept = false;
    page.on('dialog', (dialog) => { dialogs.push(dialog.message()); return accept ? dialog.accept() : dialog.dismiss(); });
    await page.goto(`${base}/admin/boats`);
    // Nothing typed: the X closes at once, no prompt.
    await page.getByRole('button', { name: 'Crear bote' }).click();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('.admin-boat-modal')).toHaveCount(0);
    assert.equal(dialogs.length, 0);
    // Typed something: asks first; "no" keeps the form (and its text), "sí" discards it.
    await page.getByRole('button', { name: 'Crear bote' }).click();
    await page.locator('#boat-name').fill('Bote que no se guarda');
    await page.waitForTimeout(400);
    assert.equal(writes.length, 0);
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect.poll(() => dialogs.length).toBe(1);
    assert.match(dialogs[0], /cambios sin guardar/i);
    await expect(page.locator('#boat-name')).toHaveValue('Bote que no se guarda');
    accept = true;
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('.admin-boat-modal')).toHaveCount(0);
    assert.equal(writes.length, 0);
  } finally { await f.browser.close(); }
});

test('Siguiente with a name creates exactly one boat (even on double click), then steps never insert again', async () => {
  const f = await fixture({ slowCreate: 400 }); const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: 'Crear bote' }).click();
    await page.locator('#boat-name').fill('  Bote Nuevo  ');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).dblclick();
    await expect(activeStep(page)).toContainText('Galería');
    assert.equal(boatPosts(writes).length, 1);
    const created = boatPosts(writes)[0].body;
    assert.equal(created.name, 'Bote Nuevo');
    assert.equal(created.active, false);
    assert.equal(created.sort_order, 3); // max(1, 2) + 1
    // The gallery only accepts a photo in the first empty slot (photos are appended).
    await expect(page.locator('.admin-tour-image-slot__empty:not([disabled])')).toHaveCount(1);
    await expect(page.locator('.admin-tour-image-slot__empty[disabled]')).toHaveCount(5);
    // The packages step works against the real, just-created boat id.
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Tours y paquetes');
    await expect(page.getByText('Bote Nuevo todavía no ofrece ningún tour.')).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Configuración');
    for (const label of ['Tours y paquetes', 'Galería', 'Información']) {
      await page.getByRole('button', { name: 'Anterior', exact: true }).click();
      await expect(activeStep(page)).toContainText(label);
    }
    assert.equal(boatPosts(writes).length, 1);
  } finally { await f.browser.close(); }
});

test('boat: Guardar (last step) is blocked without 3-6 photos, points to Galería and never publishes an incomplete boat', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: 'Crear bote' }).click();
    await page.locator('#boat-name').fill('Bote sin fotos');
    for (const label of ['Galería', 'Tours y paquetes', 'Configuración']) {
      await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
      await expect(activeStep(page)).toContainText(label);
    }
    await expect(page.getByText('Requisitos pendientes')).toBeVisible();
    await expect(page.locator('.admin-tour-missing').getByRole('listitem')).toHaveText(['Al menos 3 fotos']);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(activeStep(page)).toContainText('Galería');
    await expect(page.locator('.admin-gallery-error')).toHaveText('Para publicar el bote necesitas entre 3 y 6 imagenes.');
    assert.ok(writes.filter((w) => w.table === 'boats' && w.body && w.body.active === true).length === 0);
  } finally { await f.browser.close(); }
});

test('new package is created from the boat, keeps boat_tour_id, and gets max(sort_order)+1', async () => {
  const f = await fixture(); const { page, writes, state } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    const card = page.getByRole('region', { name: 'Fishing Tour en Second Wind' });
    await expect(card).toContainText('3 paquetes');
    await card.getByRole('button', { name: 'Agregar paquete' }).click();
    // Context: boat -> tour -> new package.
    await expect(page.getByLabel('Ubicación del paquete')).toHaveText('Second Wind / Fishing Tour');
    await expect(page.getByRole('heading', { name: 'Nuevo paquete' })).toBeVisible();
    await page.getByLabel('Nombre', { exact: true }).fill('Sunset Special');
    await page.getByLabel('Precio base (USD)').fill('450');
    await page.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    const saved = writes.find((w) => w.table === 'tour_packages' && w.method === 'POST').body;
    assert.equal(saved.boat_tour_id, 'l1');
    assert.equal(saved.name, 'Sunset Special');
    assert.equal(saved.base_price, 450);
    assert.equal(saved.sort_order, 5); // max(1, 2, 4) + 1 — count+1 would be 4 and collide
    assert.equal(state.links.filter((l) => l.boat_id === 'second-wind' && l.tour_id === 'fishing').length, 1);
  } finally { await f.browser.close(); }
});

test('editing a package from the boat keeps its id, boat_tour_id and sort_order', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    const row = page.locator('.admin-boat-package-row').filter({ hasText: 'Half Day' });
    await expect(row).toContainText('$680');
    await expect(row).toContainText('5 incluidos / 10 máximo');
    await row.getByRole('button', { name: 'Editar Half Day' }).click();
    await expect(page.getByLabel('Ubicación del paquete')).toHaveText('Second Wind / Fishing Tour');
    await expect(page.getByRole('heading', { name: 'Editar Half Day' })).toBeVisible();
    await page.getByLabel('Precio base (USD)').fill('700');
    await page.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    const saved = writes.find((w) => w.table === 'tour_packages' && w.method === 'POST').body;
    assert.deepEqual([saved.id, saved.boat_tour_id, saved.base_price, saved.sort_order], ['p1', 'l1', 700, 1]);
  } finally { await f.browser.close(); }
});

test('every tour of the boat has a clear X: it removes the tour from THIS boat only, keeps its packages, and can be added back', async () => {
  const f = await fixture(); const { page, writes, state } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    const mine = page.getByRole('region', { name: 'Tours de Second Wind' });
    const card = page.getByRole('region', { name: 'Fishing Tour en Second Wind' });
    const picker = page.getByRole('group', { name: 'Tours que se pueden agregar' });
    await expect(card.locator('.admin-badge')).toHaveText('Activo');
    await expect(card).toContainText('3 paquetes · Desde $680');
    const remove = card.getByRole('button', { name: 'Quitar Fishing Tour del bote' });
    const mark = writes.length; // opening the step already saved Información (a boats PATCH); count from here
    await expect(remove).toHaveAttribute('title', 'Quitar este tour del bote');
    // A tour that is only linked but switched off is not "in" the boat: it waits in Disponibles, packages kept.
    await expect(mine).not.toContainText('Water Toys Tour');
    await expect(picker).toContainText('Water Toys Tour');
    await expect(picker).toContainText('1 paquete guardado');

    // The X asks first and writes nothing until confirmed.
    await remove.click();
    const dialog = page.locator('.admin-modal-card').filter({ hasText: 'Quitar tour del bote' });
    await expect(dialog.getByRole('heading', { name: 'Quitar tour del bote' })).toBeVisible();
    await expect(dialog).toContainText('Este tour dejará de ofrecerse en este bote.');
    assert.equal(writes.filter((w) => w.table === 'boat_tours' || w.table === 'tour_packages' || w.table === 'tours').length, 0);
    await dialog.getByRole('button', { name: 'Volver' }).click();
    await expect(card).toBeVisible();
    assert.equal(writes.length, mark);

    await remove.click();
    await dialog.getByRole('button', { name: 'Quitar tour' }).click();
    await expect(card).toHaveCount(0);
    await expect(picker).toContainText('Fishing Tour');
    await expect(picker).toContainText('3 paquetes guardados');
    // Only this boat's relation is switched off (same semantics as disableTourForBoat): nothing is deleted,
    // the global tour is untouched, and the packages stay linked to the same boat_tour_id.
    assert.equal(writes.some((w) => w.method === 'DELETE'), false);
    assert.equal(writes.some((w) => w.table === 'tours'), false);
    const linkWrites = writes.filter((w) => w.table === 'boat_tours');
    assert.deepEqual(linkWrites.map((w) => [w.method, w.id, w.body.active]), [['PATCH', 'l1', false]]);
    const packageWrites = writes.filter((w) => w.table === 'tour_packages');
    assert.deepEqual(packageWrites.map((w) => [w.method, w.boatTourId, w.body.active]), [['PATCH', 'l1', false]]);
    assert.equal(state.tours.length, 4);
    assert.equal(state.packages.filter((p) => p.boat_tour_id === 'l1').length, 3);

    // Adding it back reuses the same boat_tours row (no duplicate relation).
    await picker.getByRole('button', { name: 'Agregar al bote: Fishing Tour' }).click();
    await expect(card).toBeVisible();
    assert.equal(writes.filter((w) => w.table === 'boat_tours' && w.method === 'POST').length, 0);
    assert.equal(state.links.filter((l) => l.boat_id === 'second-wind' && l.tour_id === 'fishing').length, 1);
  } finally { await f.browser.close(); }
});

test('"Disponibles para agregar" is always visible, lists only tours the boat does not currently offer, and adds the chosen one as active', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    // Both lists are on screen at once: what the boat offers, and what can still be added.
    await expect(page.getByRole('region', { name: 'Tours de Second Wind' })).toBeVisible();
    const picker = page.getByRole('group', { name: 'Tours que se pueden agregar' });
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('Disponibles para agregar');
    await expect(picker).toContainText('Sunset Cruise');
    await expect(picker).toContainText('Surfing Tour');
    await expect(picker).not.toContainText('Fishing Tour');
    await expect(picker).toContainText('Water Toys Tour'); // linked but switched off: available again
    await expect(page.locator('.admin-boat-tours__stats')).toContainText('1 tour ofrecido');
    await picker.getByRole('button', { name: 'Agregar al bote: Surfing Tour' }).click();
    const card = page.getByRole('region', { name: 'Surfing Tour en Second Wind' });
    await expect(card).toBeVisible();
    await expect(card.locator('.admin-badge')).toHaveText('Activo');
    await expect(card).toContainText('Sin paquetes todavía');
    await expect(card).toContainText('Este tour aún no tiene paquetes. Agrega el primero');
    await expect(picker).not.toContainText('Surfing Tour');
    // Same model as always: a boat_tours row for (boat, tour), then activated.
    const link = writes.find((w) => w.table === 'boat_tours' && w.method === 'POST').body;
    assert.deepEqual([link.boat_id, link.tour_id], ['second-wind', 'surf']);
    assert.ok(writes.some((w) => w.table === 'boat_tours' && w.method === 'PATCH' && w.body.active === true));
  } finally { await f.browser.close(); }
});

test('Resumen de paquetes is a consult screen: clean table (no technical ids), "Ver detalles" instead of "Gestionar", nothing editable', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boat-tours`);
    await expect(page.locator('.admin-page').getByRole('heading', { name: 'Resumen de paquetes', level: 1 })).toBeVisible();
    await expect(page.getByText('Consulta general de los paquetes configurados por bote y tour. Para crear o modificar paquetes, entra al bote correspondiente.')).toBeVisible();
    await expect(page.getByRole('columnheader')).toHaveText(['Paquete', 'Bote', 'Tour', 'Precio base', 'Capacidad', 'Estado', 'Acciones']);
    await expect(page.getByRole('button', { name: /Agregar|Crear|Guardar|Eliminar|Gestionar/ })).toHaveCount(0);
    await expect(page.locator('.admin-table tbody')).not.toContainText(/package-|\bp[1-4]\b/); // no technical ids in the rows
    const row = page.getByRole('row').filter({ hasText: 'Splash' });
    await expect(row).toContainText('Water Toys Tour');
    await expect(row.getByRole('button', { name: 'Ver detalles del paquete Splash' })).toHaveText('Ver detalles');
    await expect(page.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
    assert.equal(writes.length, 0);
  } finally { await f.browser.close(); }
});

test('"Ver detalles" opens a compact read-only summary: no technical wording, one action (Editar en Botes) besides the X', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boat-tours`);
    await page.getByRole('button', { name: 'Ver detalles del paquete Half Day' }).click();
    const modal = page.locator('.admin-package-detail-modal');
    await expect(modal).toBeVisible();
    // Header: Tour · Bote, name, status + a small "Solo lectura" tag.
    await expect(modal.locator('.admin-package-detail__eyebrow')).toHaveText('Fishing Tour · Second Wind');
    await expect(modal.getByRole('heading', { name: 'Half Day', level: 2 })).toBeVisible();
    await expect(modal.locator('.admin-package-detail__tags')).toContainText('Activo');
    await expect(modal.locator('.admin-package-detail__tag')).toHaveText('Solo lectura');
    // Removed: section heading, the heavy read-only banner and every implementation-flavoured sentence.
    await expect(modal.getByText(/Identificaci[oó]n/i)).toHaveCount(0);
    await expect(modal.getByText(/solo consulta|Hereda la lista|Sin selector de comida|Sin descripci[oó]n|Usa los horarios generales del sistema/i)).toHaveCount(0);
    await expect(modal.locator('h3')).toHaveText(['Horarios', 'Incluye', 'Comidas']); // no Descripción heading when there is no description
    await expect(modal.getByText('Life jacket and safety equipment', { exact: true })).toBeVisible(); // inherited list is shown as a plain list
    // Summary card: values aligned in one compact grid.
    const value = (label) => modal.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd');
    await expect(value('Bote')).toHaveText('Second Wind');
    await expect(value('Tour')).toHaveText('Fishing Tour');
    await expect(value('Precio base')).toHaveText('$680');
    await expect(value('Personas incluidas')).toHaveText('5');
    await expect(value('Máximo')).toHaveText('10');
    await expect(value('Extra por persona')).toHaveText('Sin cargo');
    await expect(value('Duración')).toHaveText('4 h');
    await expect(modal.getByText('Horarios generales', { exact: true })).toBeVisible();
    await expect(modal.getByText('Fish casado', { exact: true })).toBeVisible();
    await expect(modal.getByText('Seafood pasta', { exact: true })).toBeVisible();
    // Strictly read-only: no fields, and the only buttons are the X and Editar en Botes (no bottom "Cerrar").
    await expect(modal.locator('input, textarea, select, [contenteditable="true"]')).toHaveCount(0);
    const buttons = await modal.getByRole('button').evaluateAll((items) => items.map((item) => (item.getAttribute('aria-label') || item.textContent || '').trim()));
    assert.deepEqual(buttons, ['Cerrar', 'Editar en Botes']);
    const footerButtons = await modal.locator('.admin-modal-footer button').count();
    assert.equal(footerButtons, 1);
    await modal.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(modal).toHaveCount(0);
    // A package with its own list shows it, and hides "Comidas" when it has none.
    await page.getByRole('button', { name: 'Ver detalles del paquete 3/4 Day' }).click();
    const own = page.locator('.admin-package-detail-modal');
    await expect(own.locator('h3')).toHaveText(['Horarios', 'Incluye']);
    await expect(own.getByText('Drinks', { exact: true })).toBeVisible();
    await expect(own.getByText('Snacks', { exact: true })).toBeVisible();
    assert.equal(writes.length, 0, 'consulting never writes');
  } finally { await f.browser.close(); }
});

for (const [device, viewport] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  test(`package detail modal layout (${device}): compact, aligned, no horizontal overflow, footer action visible`, async () => {
    const f = await fixture(); const { page } = f;
    try {
      await page.setViewportSize(viewport);
      await page.goto(`${base}/admin/boat-tours`);
      await page.getByRole('button', { name: 'Ver detalles del paquete Half Day' }).click();
      const modal = page.locator('.admin-package-detail-modal');
      await expect(modal).toBeVisible();
      const box = await modal.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, 'modal fits the viewport width');
      const overflow = await page.evaluate(() => { const body = document.querySelector('.admin-package-detail'); return body.scrollWidth > body.clientWidth + 1; });
      assert.equal(overflow, false, 'no horizontal overflow inside the modal');
      // Metrics: aligned columns (3 on desktop, 2 on mobile) — items on the same row share the same top.
      const tops = await modal.locator('.admin-package-detail__grid--metrics .admin-package-detail__field').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
      const columns = new Set(tops).size === 1 ? tops.length : tops.filter((top) => top === tops[0]).length;
      assert.equal(columns, device === 'desktop' ? 3 : 2, `metrics per row on ${device}: ${tops}`);
      // The whole ficha stays short: at most ~560px tall on desktop for this package, footer button on screen.
      const editButton = modal.getByRole('button', { name: 'Editar en Botes' });
      await expect(editButton).toBeInViewport();
      if (device === 'desktop') assert.ok(box.height < 620, `modal too tall: ${Math.round(box.height)}px`);
    } finally { await f.browser.close(); }
  });
}

test('"Editar en Botes" opens the right boat on Tours y paquetes and highlights that very package', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boat-tours`);
    await page.getByRole('button', { name: 'Ver detalles del paquete 3/4 Day' }).click();
    await page.locator('.admin-package-detail-modal').getByRole('button', { name: 'Editar en Botes' }).click();
    await expect(page.locator('.admin-package-detail-modal')).toHaveCount(0);
    await expect(page.locator('.admin-boat-modal')).toBeVisible();
    await expect(activeStep(page)).toContainText('Tours y paquetes');
    await expect(page.locator('#boat-package-p2')).toHaveClass(/admin-boat-package-row--highlight/);
    await expect(page.locator('#boat-tour-fishing')).toHaveClass(/admin-boat-tour-card--highlight/);
    const navs = await page.evaluate(() => window.__navs);
    assert.ok(navs.some((url) => url.includes('/admin/boats?boatId=second-wind&tourId=fishing&packageId=p2')), JSON.stringify(navs));
    // Opening the editor from the summary wrote nothing (only Siguiente/Guardar do).
    assert.equal(writes.length, 0);
    // A package of a switched-off tour still lands on the right boat (its tour waits in "Disponibles").
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.goto(`${base}/admin/boat-tours`);
    await page.getByRole('button', { name: 'Ver detalles del paquete Splash' }).click();
    await page.locator('.admin-package-detail-modal').getByRole('button', { name: 'Editar en Botes' }).click();
    await expect(activeStep(page)).toContainText('Tours y paquetes');
    await expect(page.locator('#boat-tour-available-water')).toHaveClass(/admin-boat-tours__available-item--highlight/);
  } finally { await f.browser.close(); }
});

test('Descargar PDF exports what is being consulted (search and filters, all pages) as a real PDF download', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/boat-tours`);
    await expect(page.getByRole('row').filter({ hasText: 'Splash' })).toBeVisible();
    // Apply a filter and a search first: the export must carry them (and ask for ALL matching rows, not one page).
    await page.getByRole('button', { name: /Filtros/ }).click();
    await page.getByLabel('Estado').selectOption('active');
    await page.getByPlaceholder('Buscar paquetes por nombre').fill('Day');
    await page.waitForTimeout(600);
    const exportRequests = [];
    page.on('request', (request) => { const url = request.url(); if (url.includes('/rest/v1/tour_packages') && url.includes('limit=2000')) exportRequests.push(decodeURIComponent(url)); });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).click()]);
    assert.match(download.suggestedFilename(), /^resumen-de-paquetes-\d{4}-\d{2}-\d{2}\.pdf$/);
    const path = await download.path();
    const bytes = (await import('node:fs')).readFileSync(path);
    assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(bytes.length > 8000, `PDF too small: ${bytes.length}`);
    assert.equal(exportRequests.length, 1, 'one export query');
    assert.match(exportRequests[0], /active=eq\.true/);
    assert.match(exportRequests[0], /name=ilike\.[%*]Day[%*]/);
    assert.doesNotMatch(exportRequests[0], /offset=/);
    await expect(page.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
    assert.equal(writes.length, 0);
  } finally { await f.browser.close(); }
});

test('the PDF layout: brand header, title, generation date, filters, striped table, page X of Y, several pages', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/boat-tours`);
    const result = await page.evaluate(async () => {
      const { createPackagesPdf, loadLogoDataUrl } = await import('/src/utils/packagesPdf.ts');
      const rows = Array.from({ length: 45 }, (_, n) => ({ name: `Package ${n + 1}`, boat: 'Second Wind', tour: 'Fishing Tour', price: `$${600 + n}`, capacity: '5 / 10', duration: '4 h', status: n % 3 ? 'Activo' : 'Inactivo' }));
      const logo = await loadLogoDataUrl();
      const doc = await createPackagesPdf({ rows, filters: ['Bote: Second Wind', 'Estado: Activos', 'Búsqueda: "Package"'], generatedAt: new Date(2026, 8, 24, 20, 41), logoDataUrl: logo, compress: false });
      const empty = await createPackagesPdf({ rows: [], filters: [], generatedAt: new Date(2026, 8, 24, 20, 41), compress: false });
      const raw = (document) => { const buffer = new Uint8Array(document.output('arraybuffer')); let text = ''; for (const byte of buffer) text += String.fromCharCode(byte); return text; };
      return { pages: doc.getNumberOfPages(), hasLogo: Boolean(logo), text: raw(doc), emptyText: raw(empty), emptyPages: empty.getNumberOfPages() };
    });
    assert.ok(result.hasLogo, 'the brand logo loads');
    assert.ok(result.pages >= 2, `45 rows must paginate (pages: ${result.pages})`);
    for (const expected of ['Resumen de paquetes', 'Generado el 24 de septiembre de 2026', '45 paquetes', 'FILTROS', 'Bote: Second Wind', 'Estado: Activos', 'Package 1)', 'Package 45)', 'Precio base', 'Incluidos / m', 'Papagayo Fishing Tour', `P\\341gina 1 de ${result.pages}`, `P\\341gina ${result.pages} de ${result.pages}`]) {
      assert.ok(result.text.includes(expected) || result.text.includes(expected.replace('\\341', 'á')), `PDF must contain "${expected}"`);
    }
    assert.ok(result.text.includes('/Subtype /Image') || result.text.includes('/Type /XObject'), 'the logo is embedded as an image');
    assert.equal(result.emptyPages, 1);
    assert.ok(result.emptyText.includes('No hay paquetes para los filtros seleccionados.'));
    assert.ok(result.emptyText.includes('Sin filtros: se incluyen todos los paquetes.'));
  } finally { await f.browser.close(); }
});

// --- Botes: Información (equipment), Galería (Tours pattern), Configuración (Tours layout) ------------------

test('equipment: English is the source — Spanish is generated on save, only for new or changed items', async () => {
  const f = await fixture({ equipment: [eqRow('e1', 'second-wind', 'GPS Garmin', 'Garmin GPS', 1), eqRow('e2', 'second-wind', 'Sonar', 'Sonar unit', 2)] });
  const { page, writes, translateCalls, state } = f;
  try {
    await openSecondWind(page);
    const rows = page.locator('.admin-equipment-row');
    await expect(rows).toHaveCount(2);
    // One field per item and it shows the English text (label_en), never a Spanish/English pair.
    await expect(rows.locator('input')).toHaveCount(2);
    await expect(page.locator('.admin-boat-step-body').getByText(/^(English|Inglés|Español)$/)).toHaveCount(0);
    await expect(page.getByLabel('Equipamiento 1')).toHaveValue('Garmin GPS');
    await expect(page.getByText('Escríbelo en inglés: el español se genera al guardar.')).toBeVisible();
    // Typing/adding does not call the translator by itself.
    await page.locator('#boat-equipment-input').fill('Cooler');
    await page.locator('#boat-equipment-input').press('Enter');
    await expect(rows).toHaveCount(3);
    await page.getByLabel('Equipamiento 2').fill('Sonar Garmin');
    await page.getByLabel('Equipamiento 2').blur();
    await page.waitForTimeout(300);
    assert.equal(translateCalls.length, 0);
    // Siguiente persists Información: only the changed and the new item are translated (EN -> ES), in one request.
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(page)).toContainText('Galería');
    assert.equal(translateCalls.length, 1);
    assert.deepEqual(translateCalls[0], { texts: ['Sonar Garmin', 'Cooler'], targetLang: 'ES', sourceLang: 'EN' });
    const byId = (id) => writes.filter((w) => w.table === 'boat_equipment' && w.method === 'POST' && w.body.id === id).at(-1)?.body;
    assert.deepEqual([byId('e1').label_en, byId('e1').label_es], ['Garmin GPS', 'GPS Garmin'], 'untouched item keeps both copies');
    assert.deepEqual([byId('e2').label, byId('e2').label_en, byId('e2').label_es], ['Sonar Garmin', 'Sonar Garmin', 'Sonar Garmin [ES]']);
    const added = state.equipment.find((item) => item.label_en === 'Cooler');
    assert.deepEqual([added.boat_id, added.label, added.label_es, added.sort_order], ['second-wind', 'Cooler', 'Cooler [ES]', 3]);
    // Guardar borrador with nothing changed does not translate again.
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.locator('.admin-boat-modal')).toHaveCount(0);
    assert.equal(translateCalls.length, 1, 'unchanged equipment must not be retranslated');
  } finally { await f.browser.close(); }
});

test('equipment: Guardar borrador also translates; if DeepL fails nothing is saved and the previous Spanish is kept', async () => {
  const f = await fixture({ equipment: [eqRow('e1', 'second-wind', 'GPS Garmin', 'Garmin GPS', 1)], translate: { fails: true } });
  const { page, writes, translateCalls, state, translation } = f;
  try {
    await openSecondWind(page);
    await page.getByLabel('Equipamiento 1').fill('Garmin GPS plotter');
    await page.locator('#boat-equipment-input').fill('VHF radio');
    await page.locator('#boat-equipment-input').press('Enter');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.locator('.admin-boat-modal').getByText(SPANISH_ERROR)).toBeVisible();
    await expect(activeStep(page)).toContainText('Información');
    assert.equal(translateCalls.length, 1);
    assert.equal(writes.length, 0, 'nothing may be written when the translation failed');
    assert.deepEqual([state.equipment[0].label_en, state.equipment[0].label_es], ['Garmin GPS', 'GPS Garmin']);
    await expect(page.getByLabel('Equipamiento 1')).toHaveValue('Garmin GPS plotter');
    translation.fails = false;
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.locator('.admin-boat-modal')).toHaveCount(0);
    assert.deepEqual(state.equipment.map((item) => [item.label_en, item.label_es]), [['Garmin GPS plotter', 'Garmin GPS plotter [ES]'], ['VHF radio', 'VHF radio [ES]']]);
  } finally { await f.browser.close(); }
});

test('boat badge: English is the source, Spanish is generated on save (create and edit), unchanged badge is not retranslated', async () => {
  const f = await fixture({ boats: [boatRow('second-wind', 'Second Wind', 1, { badge: 'Lujo', badge_en: 'Luxury', badge_es: 'Lujo' })] });
  const { page, writes, translateCalls } = f;
  try {
    await openSecondWind(page);
    await expect(page.locator('#boat-badge')).toHaveValue('Luxury');
    await page.locator('#boat-length').fill('40 ft'); // not translatable: a technical spec
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.locator('.admin-boat-modal')).toHaveCount(0);
    assert.equal(translateCalls.length, 0);
    const first = writes.filter((w) => w.table === 'boats' && w.method === 'PATCH').at(-1).body;
    assert.equal('badge_es' in first, false);
    assert.equal(first.length, '40 ft');
    await page.getByRole('button', { name: 'Editar bote Second Wind' }).click();
    await page.locator('#boat-badge').fill('Luxury meets nature');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.locator('.admin-boat-modal')).toHaveCount(0);
    assert.deepEqual(translateCalls.map((call) => call.texts), [['Luxury meets nature']]);
    const saved = writes.filter((w) => w.table === 'boats' && w.method === 'PATCH').at(-1).body;
    assert.deepEqual([saved.badge, saved.badge_en, saved.badge_es], ['Luxury meets nature', 'Luxury meets nature', 'Luxury meets nature [ES]']);
    assert.equal('name_es' in saved, false, 'the boat name is a proper name and is never translated');
  } finally { await f.browser.close(); }

  // CREATE: the row is inserted already bilingual (translation first, then insert).
  const g = await fixture(); const { page: createPage, writes: createWrites, translateCalls: createCalls } = g;
  try {
    await createPage.goto(`${base}/admin/boats`);
    await createPage.getByRole('button', { name: 'Crear bote' }).click();
    await createPage.locator('#boat-name').fill('Nuevo Bote');
    await createPage.locator('#boat-badge').fill('Family friendly');
    await createPage.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(createPage)).toContainText('Galería');
    assert.deepEqual(createCalls.map((call) => call.texts), [['Family friendly']]);
    const insert = boatPosts(createWrites)[0].body;
    assert.deepEqual([insert.badge, insert.badge_en, insert.badge_es, insert.name], ['Family friendly', 'Family friendly', 'Family friendly [ES]', 'Nuevo Bote']);
  } finally { await g.browser.close(); }

  // FAIL on create: nothing is inserted.
  const h = await fixture({ translate: { fails: true } });
  try {
    await h.page.goto(`${base}/admin/boats`);
    await h.page.getByRole('button', { name: 'Crear bote' }).click();
    await h.page.locator('#boat-name').fill('Nuevo Bote');
    await h.page.locator('#boat-badge').fill('Family friendly');
    await h.page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(h.page.locator('.admin-boat-modal').getByText(SPANISH_ERROR)).toBeVisible();
    assert.equal(boatPosts(h.writes).length, 0);
  } finally { await h.browser.close(); }
});

test('Configuración of a boat: Requisitos pendientes only when something is missing; active boats show none', async () => {
  const draft = await fixture({ boats: [boatRow('borrador', 'Bote borrador', 1, { active: false })] });
  try {
    await draft.page.goto(`${base}/admin/boats`);
    await draft.page.getByRole('button', { name: 'Editar bote Bote borrador' }).click();
    await goToStep(draft.page, 'Configuración');
    await expect(draft.page.locator('.admin-tour-config-row .admin-badge')).toHaveText('Inactivo');
    await expect(draft.page.getByText('No aparece en el sitio público ni puede reservarse.')).toBeVisible();
    await expect(draft.page.locator('.admin-tour-missing').getByRole('listitem')).toHaveText(['Al menos 3 fotos']);
  } finally { await draft.browser.close(); }

  const active = await fixture();
  try {
    await openSecondWind(active.page);
    await goToStep(active.page, 'Configuración');
    await expect(active.page.locator('.admin-tour-config-row .admin-badge')).toHaveText('Activo');
    await expect(active.page.getByText('Visible en el sitio público y disponible para reservas.')).toBeVisible();
    await expect(active.page.getByText('Requisitos pendientes')).toHaveCount(0);
    // Same delete section as Tours: title + plain-language copy, danger only on the button.
    const danger = active.page.locator('.admin-tour-danger-row');
    await expect(danger.locator('strong')).toHaveText('Eliminar bote');
    await expect(danger).toContainText('Esta acción elimina el bote y su información asociada. No se puede deshacer.');
    await expect(danger.locator('svg')).toHaveCount(1);
    await expect(active.page.locator('.admin-boat-step-body')).not.toContainText(/base de datos|reservas hist|FK|constraint/i);
  } finally { await active.browser.close(); }
});

test('boat wizard on a phone: stepper and footer stay usable without overlap', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSecondWind(page);
    await goToStep(page, 'Configuración');
    await expect(activeStep(page)).toContainText('Configuración');
    const boxes = await page.locator('.admin-wizard-footer button').evaluateAll((buttons) => buttons.map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
    assert.equal(boxes.length, 3);
    for (const [i, a] of boxes.entries()) for (const c of boxes.slice(i + 1)) assert.ok(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t, 'footer buttons must not overlap');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
  } finally { await f.browser.close(); }
});

// --- Tours y paquetes: lista de disponibles y formulario de paquete ---------------------------------------

test('"Disponibles para agregar" is a compact list; a search box only appears when there are many tours', async () => {
  const few = await fixture();
  try {
    await openSecondWind(few.page);
    await goToStep(few.page, 'Tours y paquetes');
    await expect(few.page.getByLabel('Buscar tour disponible')).toHaveCount(0);
    const rows = few.page.locator('.admin-boat-tours__available-list li');
    await expect(rows).toHaveCount(3);
    const heights = await rows.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
    for (const height of heights) assert.ok(height <= 56, `available row too tall: ${heights}`);
    // "En este bote" and "Disponibles" are two clearly separate, titled groups.
    await expect(few.page.getByRole('heading', { name: /^En Second Wind/ })).toBeVisible();
    await expect(few.page.getByRole('heading', { name: /^Disponibles para agregar/ })).toBeVisible();
  } finally { await few.browser.close(); }

  const many = await fixture({ extraTours: 4 });
  try {
    await openSecondWind(many.page);
    await goToStep(many.page, 'Tours y paquetes');
    const search = many.page.getByLabel('Buscar tour disponible');
    await expect(search).toBeVisible();
    await expect(many.page.locator('.admin-boat-tours__available-list li')).toHaveCount(7);
    await search.fill('extra tour 3');
    await expect(many.page.locator('.admin-boat-tours__available-list li')).toHaveCount(1);
    await expect(many.page.locator('.admin-boat-tours__available-list li')).toContainText('Extra Tour 3');
    await search.fill('zzz');
    await expect(many.page.getByText('Ningún tour coincide con la búsqueda.')).toBeVisible();
    // The list scrolls inside its own panel, never pushing the page.
    const overflowY = await many.page.locator('.admin-boat-tours__available-list').evaluate((el) => getComputedStyle(el).overflowY);
    assert.equal(overflowY, 'auto');
  } finally { await many.browser.close(); }
});

test('package form: grouped in sections, short fields on an aligned 2-column grid, own footer', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    await page.getByRole('region', { name: 'Fishing Tour en Second Wind' }).getByRole('button', { name: 'Agregar paquete' }).click();
    const editor = page.locator('.admin-package-compact-editor');
    await expect(editor.locator('.admin-package-section > h4')).toHaveText(['Información del paquete', 'Precio y capacidad', 'Horarios', 'Incluye', 'Visibilidad']);
    // Focus mode: the list of available tours steps aside while a package is being written.
    await expect(page.getByRole('group', { name: 'Tours que se pueden agregar' })).toBeHidden();

    const box = async (label) => editor.getByLabel(label).first().boundingBox();
    const [name, duration, price, extra, included, max] = [await editor.getByLabel('Nombre', { exact: true }).boundingBox(), await box('Duración (horas, opcional)'), await box('Precio base (USD)'), await box('Extra por persona adicional (USD)'), await box('Personas incluidas'), await box('Máximo del paquete')];
    // Pairs share a row and the same width; both columns line up down the form.
    assert.equal(Math.round(name.y), Math.round(duration.y));
    assert.equal(Math.round(price.y), Math.round(extra.y));
    assert.equal(Math.round(included.y), Math.round(max.y));
    assert.equal(Math.round(name.width), Math.round(duration.width));
    assert.deepEqual([Math.round(price.x), Math.round(price.width)], [Math.round(name.x), Math.round(name.width)]);
    assert.deepEqual([Math.round(max.x), Math.round(max.width)], [Math.round(duration.x), Math.round(duration.width)]);
    // Descripción spans the full width.
    const description = await editor.getByLabel(/^Descripción/).boundingBox();
    assert.ok(description.width > name.width * 1.8, 'Descripción must be full width');

    // The package's own footer is inside the editor, always reachable, and separate from the wizard footer.
    const footer = editor.locator('.admin-package-editor__footer');
    await expect(footer.getByRole('button', { name: 'Cancelar' })).toBeInViewport();
    await expect(footer.getByRole('button', { name: 'Guardar paquete' })).toBeInViewport();
    await expect(page.locator('.admin-wizard-footer').getByRole('button', { name: 'Guardar paquete' })).toHaveCount(0);
    await expect(page.locator('.admin-wizard-footer').getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
    await footer.getByRole('button', { name: 'Cancelar' }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Tours que se pueden agregar' })).toBeVisible();
  } finally { await f.browser.close(); }
});

test('package form: advanced controls appear only when needed (horarios, incluye, comidas)', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    await page.getByRole('region', { name: 'Fishing Tour en Second Wind' }).getByRole('button', { name: 'Agregar paquete' }).click();
    const editor = page.locator('.admin-package-compact-editor');
    const generalTimes = editor.getByRole('checkbox', { name: 'Usar los horarios generales' });
    // Horarios: with the general schedule there is nothing else to show.
    await generalTimes.check();
    await expect(editor.getByLabel('Agregar hora de salida')).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Agregar hora' })).toHaveCount(0);
    await expect(editor.getByText('Se ofrecen todos los horarios generales de salida.')).toBeVisible();
    await generalTimes.uncheck();
    await expect(editor.getByLabel('Agregar hora de salida')).toBeVisible();
    // Incluye: the tour's list is used unless the admin customises it.
    const customise = editor.getByRole('checkbox', { name: 'Personalizar lo incluido' });
    await expect(customise).not.toBeChecked();
    await expect(editor.getByLabel('Elementos incluidos, uno por línea')).toHaveCount(0);
    await customise.check();
    await expect(editor.getByLabel('Elementos incluidos, uno por línea')).toBeVisible();
    await customise.uncheck();
    await expect(editor.getByLabel('Elementos incluidos, uno por línea')).toHaveCount(0);
    // Comidas: no rows until one is added.
    await expect(editor.getByLabel('Comida 1', { exact: true })).toHaveCount(0);
    await editor.getByRole('button', { name: 'Agregar comida' }).click();
    await expect(editor.getByLabel('Comida 1', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: 'Eliminar comida 1' }).click();
    await expect(editor.getByLabel('Comida 1', { exact: true })).toHaveCount(0);
    // Cotización personalizada shows no extra controls: it is a single switch.
    const before = await editor.locator('input, textarea, select').count();
    await editor.getByRole('checkbox', { name: /Cotización personalizada/ }).check();
    assert.equal(await editor.locator('input, textarea, select').count(), before);
  } finally { await f.browser.close(); }
});

test('package form keeps every real field: what is typed is exactly what is saved (same boat_tour_id)', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    await page.getByRole('region', { name: 'Fishing Tour en Second Wind' }).getByRole('button', { name: 'Agregar paquete' }).click();
    const editor = page.locator('.admin-package-compact-editor');
    await editor.getByLabel('Nombre', { exact: true }).fill('Sunset Special');
    await editor.getByLabel('Duración (horas, opcional)').fill('2,5');
    await editor.getByLabel(/^Descripción/).fill('Atardecer con snacks');
    await editor.getByLabel('Precio base (USD)').fill('500');
    await editor.getByLabel('Extra por persona adicional (USD)').fill('25');
    await editor.getByLabel('Personas incluidas').fill('2');
    await editor.getByLabel('Máximo del paquete').fill('8');
    await editor.getByRole('checkbox', { name: /Cotización personalizada/ }).check();
    await editor.getByLabel('Agregar hora de salida').fill('09:30');
    await editor.getByRole('button', { name: 'Agregar hora' }).click();
    await expect(editor.getByRole('checkbox', { name: '9:30 AM' })).toBeChecked();
    await editor.getByRole('checkbox', { name: 'Personalizar lo incluido' }).check();
    await editor.getByLabel('Elementos incluidos, uno por línea').fill('Snacks\nBebidas');
    await editor.getByRole('button', { name: 'Agregar comida' }).click();
    await editor.getByLabel('Comida 1', { exact: true }).fill('Ceviche');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    const saved = writes.find((w) => w.table === 'tour_packages' && w.method === 'POST').body;
    assert.equal(saved.boat_tour_id, 'l1');
    assert.equal(saved.name, 'Sunset Special');
    assert.equal(saved.duration_minutes, 150);
    assert.equal(saved.description, 'Atardecer con snacks');
    assert.equal(saved.base_price, 500);
    assert.equal(saved.extra_guest_price, 25);
    assert.equal(saved.included_guests, 2);
    assert.equal(saved.max_guests, 8);
    assert.equal(saved.custom_quote, true);
    assert.deepEqual(saved.departure_times, ['09:30']);
    assert.deepEqual(saved.package_included, ['Snacks', 'Bebidas']);
    assert.deepEqual(saved.meal_options, [{ es: 'Ceviche [ES]', en: 'Ceviche' }]); // Spanish comes from the (mocked) translator
    assert.deepEqual([saved.name, saved.name_en, saved.name_es], ['Sunset Special', 'Sunset Special', 'Sunset Special [ES]']);
    assert.deepEqual([saved.description_en, saved.description_es], ['Atardecer con snacks', 'Atardecer con snacks [ES]']);
    assert.deepEqual([saved.package_included_en, saved.package_included_es], [['Snacks', 'Bebidas'], ['Snacks [ES]', 'Bebidas [ES]']]);
    assert.equal(saved.active, true);
  } finally { await f.browser.close(); }
});

test('package form: general schedule + tour list save as null, Desactivar paquete saves inactive, Eliminar paquete deletes only that package', async () => {
  const f = await fixture(); const { page, writes, state } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    const row = page.locator('.admin-boat-package-row').filter({ hasText: 'Half Day' });
    await row.getByRole('button', { name: 'Editar Half Day' }).click();
    const editor = page.locator('.admin-package-compact-editor');
    // Existing package (departure_times null / package_included null) opens with both defaults on.
    await expect(editor.getByRole('checkbox', { name: 'Usar los horarios generales' })).toBeChecked();
    await expect(editor.getByRole('checkbox', { name: 'Personalizar lo incluido' })).not.toBeChecked();
    await expect(editor.getByText('Visible y reservable.')).toBeVisible();
    await editor.getByRole('button', { name: 'Desactivar paquete' }).click();
    await expect(editor.getByText('Oculto y no reservable.')).toBeVisible();
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    const saved = writes.find((w) => w.table === 'tour_packages' && w.method === 'POST').body;
    assert.deepEqual([saved.id, saved.departure_times, saved.package_included, saved.active], ['p1', null, null, false]);

    await page.locator('.admin-boat-package-row').filter({ hasText: '3/4 Day' }).getByRole('button', { name: 'Editar 3/4 Day' }).click();
    await page.locator('.admin-package-compact-editor').getByRole('button', { name: 'Eliminar paquete' }).click();
    await page.locator('.admin-modal-card').filter({ hasText: 'Eliminar paquete' }).getByRole('button', { name: 'Sí, eliminar paquete' }).click();
    await expect(page.getByText('Paquete eliminado.')).toBeVisible();
    assert.deepEqual(writes.filter((w) => w.method === 'DELETE').map((w) => [w.table, w.id]), [['tour_packages', 'p2']]);
    assert.equal(state.packages.some((p) => p.id === 'p1'), true);
  } finally { await f.browser.close(); }
});

// --- Configuración: Guardar borrador / Guardar / Mostrar-Ocultar ---------------------------------------------

test('Configuración: an inactive boat shows "Mostrar bote" (Eye); showing checks name, capacity and 3-6 photos, then Ocultar bote (EyeOff) hides it again', async () => {
  const f = await fixture({ boats: [boatRow('borrador', 'Bote borrador', 1, { active: false })], images: threeImages('borrador') }); const { page, writes, state } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: 'Editar bote Bote borrador' }).click();
    await goToStep(page, 'Configuración');
    const toggle = page.locator('.admin-tour-config-row').getByRole('button', { name: /^(Mostrar|Ocultar) bote$/ });
    await expect(toggle).toHaveText('Mostrar bote');
    await expect(toggle.locator('svg.lucide-eye')).toHaveCount(1);
    await expect(toggle.locator('svg.lucide-eye-off')).toHaveCount(0);
    await expect(page.getByText('Listo para publicar.')).toBeVisible();
    await expect(page.locator('.admin-tour-config-row .admin-badge')).toHaveText('Inactivo');
    await toggle.click();
    await expect(page.locator('.admin-tour-config-row .admin-badge')).toHaveText('Activo');
    await expect(toggle).toHaveText('Ocultar bote');
    await expect(toggle.locator('svg.lucide-eye-off')).toHaveCount(1);
    await expect(page.getByText('Requisitos pendientes')).toHaveCount(0);
    assert.deepEqual(writes.filter((w) => w.table === 'boats' && 'active' in w.body).map((w) => [w.method, w.id, w.body.active]), [['PATCH', 'borrador', true]]);
    assert.equal(state.boats[0].active, true);
    await toggle.click();
    await expect(toggle).toHaveText('Mostrar bote');
    assert.deepEqual(writes.filter((w) => w.table === 'boats' && 'active' in w.body).map((w) => w.body.active), [true, false]);
    assert.equal(state.boats[0].active, false);
    assert.equal(writes.some((w) => w.method === 'DELETE' || w.table === 'boat_tours' || w.table === 'tour_packages'), false);
  } finally { await f.browser.close(); }

  // Fewer than 3 photos: nothing is published, and the missing requirement is listed in the same card.
  const short = await fixture({ boats: [boatRow('corto', 'Bote corto', 1, { active: false })], images: threeImages('corto').slice(0, 2) });
  try {
    await short.page.goto(`${base}/admin/boats`);
    await short.page.getByRole('button', { name: 'Editar bote Bote corto' }).click();
    await goToStep(short.page, 'Configuración');
    await expect(short.page.locator('.admin-tour-missing').getByRole('listitem')).toHaveText(['Al menos 3 fotos']);
    await short.page.getByRole('button', { name: 'Mostrar bote' }).click();
    await expect(short.page.locator('.admin-boat-modal').getByText('Completa los requisitos antes de mostrar el bote.')).toBeVisible();
    await expect(short.page.locator('.admin-tour-config-row .admin-badge')).toHaveText('Inactivo');
    assert.equal(short.writes.filter((w) => w.table === 'boats' && 'active' in w.body).length, 0);
  } finally { await short.browser.close(); }

  // Name and capacity are enforced before Configuración can even be reached.
  const invalid = await fixture({ boats: [boatRow('sinnombre', 'Bote X', 1, { active: false })], images: threeImages('sinnombre') });
  try {
    await invalid.page.goto(`${base}/admin/boats`);
    await invalid.page.getByRole('button', { name: 'Editar bote Bote X' }).click();
    await invalid.page.locator('#boat-name').fill('');
    await goToStep(invalid.page, 'Configuración');
    await expect(invalid.page.locator('#boat-name-error')).toHaveText('El nombre del bote es obligatorio.');
    await expect(activeStep(invalid.page)).toContainText('Información');
    await invalid.page.locator('#boat-name').fill('Bote X');
    await invalid.page.locator('#boat-max-guests').fill('0');
    await goToStep(invalid.page, 'Configuración');
    await expect(invalid.page.getByText('La capacidad debe ser al menos 1.')).toBeVisible();
    await expect(activeStep(invalid.page)).toContainText('Información');
    assert.equal(invalid.writes.filter((w) => w.table === 'boats').length, 0);
  } finally { await invalid.browser.close(); }
});

test('Guardar borrador never changes visibility: a visible boat stays visible, a hidden one stays hidden', async () => {
  const f = await fixture({ images: threeImages('second-wind') }); const { page, writes, state } = f;
  try {
    await openSecondWind(page);
    await page.locator('#boat-badge').fill('Nueva etiqueta');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('Cambios guardados. El bote sigue visible.')).toBeVisible();
    const patches = writes.filter((w) => w.table === 'boats' && w.method === 'PATCH');
    assert.equal(patches.length, 1);
    assert.equal('active' in patches[0].body, false, 'Guardar borrador must not send `active`');
    assert.equal(patches[0].body.badge, 'Nueva etiqueta');
    assert.equal(state.boats.find((b) => b.id === 'second-wind').active, true);
  } finally { await f.browser.close(); }

  const hidden = await fixture({ boats: [boatRow('oculto', 'Bote oculto', 1, { active: false })], images: threeImages('oculto') });
  try {
    await hidden.page.goto(`${base}/admin/boats`);
    await hidden.page.getByRole('button', { name: 'Editar bote Bote oculto' }).click();
    await hidden.page.locator('#boat-badge').fill('x');
    await hidden.page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(hidden.page.getByText('Borrador guardado.')).toBeVisible();
    assert.equal(hidden.writes.some((w) => w.table === 'boats' && 'active' in (w.body ?? {})), false);
    assert.equal(hidden.state.boats[0].active, false);
  } finally { await hidden.browser.close(); }
});

test('Guardar (last step) publishes a complete boat, but a boat hidden from Configuración stays hidden', async () => {
  const draft = await fixture({ boats: [boatRow('listo', 'Bote listo', 1, { active: false })], images: threeImages('listo') });
  try {
    await draft.page.goto(`${base}/admin/boats`);
    await draft.page.getByRole('button', { name: 'Editar bote Bote listo' }).click();
    await goToStep(draft.page, 'Configuración');
    await draft.page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(draft.page.getByText('Bote publicado.')).toBeVisible();
    const patch = draft.writes.filter((w) => w.table === 'boats' && w.method === 'PATCH').at(-1);
    assert.equal(patch.body.active, true);
    assert.equal(draft.state.boats[0].active, true);
  } finally { await draft.browser.close(); }

  const shown = await fixture({ images: threeImages('second-wind') });
  try {
    await openSecondWind(shown.page);
    await goToStep(shown.page, 'Configuración');
    await shown.page.getByRole('button', { name: 'Ocultar bote' }).click();
    await expect(shown.page.getByRole('button', { name: 'Mostrar bote' })).toBeVisible();
    await shown.page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(shown.page.getByText('Cambios guardados. El bote sigue oculto.')).toBeVisible();
    assert.equal(shown.state.boats.find((b) => b.id === 'second-wind').active, false);
    assert.equal(shown.writes.filter((w) => w.table === 'boats' && w.body.active === true).length, 0);
  } finally { await shown.browser.close(); }
});

test('Configuración: Eliminar bote still asks for confirmation and then deletes (hard delete)', async () => {
  const f = await fixture(); const { page, writes } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Configuración');
    await page.locator('.admin-tour-danger-row').getByRole('button', { name: 'Eliminar bote' }).click();
    const dialog = page.locator('.admin-modal-card').filter({ hasText: 'Esta acción elimina el bote y su información asociada, incluidos' });
    await expect(dialog.getByRole('heading', { name: 'Eliminar bote' })).toBeVisible();
    assert.equal(writes.filter((w) => w.method === 'DELETE').length, 0);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    assert.equal(writes.filter((w) => w.method === 'DELETE').length, 0);
    await page.locator('.admin-tour-danger-row').getByRole('button', { name: 'Eliminar bote' }).click();
    await dialog.getByRole('button', { name: 'Eliminar bote' }).click();
    await expect.poll(() => writes.filter((w) => w.table === 'boats' && w.method === 'DELETE').map((w) => w.id)).toEqual(['second-wind']);
  } finally { await f.browser.close(); }
});

// --- Galería: replacing a photo never orphans (or loses) files in Storage --------------------------------

async function replacePhoto(page, slot = 1) {
  await goToStep(page, 'Galería');
  await expect(activeStep(page)).toContainText('Galería');
  await page.getByRole('button', { name: `Cambiar foto ${slot}` }).click();
  await page.locator('input[type="file"][aria-label="Elegir archivo de imagen"]').setInputFiles({ name: 'nueva.png', mimeType: 'image/png', buffer: makePng() });
  const go = page.getByRole('button', { name: 'Continuar y subir' });
  await expect(go).toBeEnabled({ timeout: 15000 });
  await go.click();
}

test('replace photo: if the upload fails, the previous photo is untouched and nothing is deleted', async () => {
  const f = await fixture({ images: threeImages('second-wind'), uploadFails: true }); const { page, writes, state, storage } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Galería'); // leaving Información saves it once; count writes from here
    const mark = writes.length;
    await replacePhoto(page, 1);
    await expect(page.getByText('Upload failed on purpose')).toBeVisible();
    assert.deepEqual(storage.map((call) => call.kind), ['upload']);
    assert.equal(writes.slice(mark).length, 0, 'a failed upload must not touch the database');
    assert.equal(state.images[0].storage_path, 'boats/second-wind/img1.webp');
  } finally { await f.browser.close(); }
});

test('replace photo: if saving the new reference fails, the NEW upload is discarded and the old photo stays', async () => {
  const f = await fixture({ images: threeImages('second-wind'), imageUpdateFails: true }); const { page, writes, state, storage } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Galería');
    const mark = writes.length;
    await replacePhoto(page, 1);
    await expect(page.getByText('No se pudo actualizar la foto (test)')).toBeVisible();
    const deletes = storage.filter((call) => call.kind === 'delete');
    assert.deepEqual(deletes.map((call) => call.body.storagePath), ['boats/second-wind/new-1.webp'], 'only the new, unreferenced file may be removed');
    assert.equal(state.images[0].storage_path, 'boats/second-wind/img1.webp');
    assert.equal(writes.slice(mark).some((w) => w.table === 'boats'), false, 'no cover/gallery sync when the row update failed');
  } finally { await f.browser.close(); }
});

test('replace photo: the old file is deleted only AFTER the new file and every reference are saved', async () => {
  const f = await fixture({ images: threeImages('second-wind') }); const { page, state, storage, events } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Galería');
    const mark = events.length;
    await replacePhoto(page, 1);
    await expect.poll(() => storage.filter((call) => call.kind === 'delete').length).toBe(1);
    const order = events.slice(mark).filter((event) => ['upload', 'PATCH:boat_images', 'PATCH:boats'].includes(event) || event.startsWith('delete:'));
    assert.deepEqual(order.slice(0, 3), ['upload', 'PATCH:boat_images', 'PATCH:boats']);
    assert.equal(order.at(-1), 'delete:boats/second-wind/img1.webp');
    assert.deepEqual(storage.find((call) => call.kind === 'delete').body, { storagePath: 'boats/second-wind/img1.webp', resourceTable: 'boat_images', resourceId: 'img1' });
    assert.equal(state.images[0].storage_path, 'boats/second-wind/new-1.webp');
    assert.equal(state.images.filter((image) => image.storage_path === 'boats/second-wind/img1.webp').length, 0);
    // The other two photos and their files were not touched.
    assert.deepEqual(state.images.slice(1).map((image) => image.storage_path), ['boats/second-wind/img2.webp', 'boats/second-wind/img3.webp']);
  } finally { await f.browser.close(); }
});

test('replace photo: a file that is still referenced (delete refused) is kept and reported, the replacement stays valid', async () => {
  const f = await fixture({ images: threeImages('second-wind'), deleteStatus: 409 }); const { page, state, storage } = f;
  try {
    await openSecondWind(page);
    await replacePhoto(page, 1);
    await expect(page.locator('.admin-boat-modal').getByText('La foto anterior no se pudo borrar del almacenamiento y quedó pendiente de limpieza.')).toBeVisible();
    assert.equal(storage.filter((call) => call.kind === 'delete').length, 1);
    assert.equal(state.images[0].storage_path, 'boats/second-wind/new-1.webp');
    await expect(page.locator('.admin-tour-image-slot').first().locator('img')).toBeVisible();
  } finally { await f.browser.close(); }
});

test('replace photo: a legacy photo without a storage path has nothing to delete', async () => {
  const f = await fixture({ images: [imgRow('img1', 'second-wind', 1, { storage_path: null }), ...threeImages('second-wind').slice(1)] }); const { page, state, storage } = f;
  try {
    await openSecondWind(page);
    await replacePhoto(page, 1);
    await expect.poll(() => state.images[0].storage_path).toBe('boats/second-wind/new-1.webp');
    assert.equal(storage.filter((call) => call.kind === 'delete').length, 0);
  } finally { await f.browser.close(); }
});

test('deep link to an offered tour (Resumen > Gestionar) opens Tours y paquetes and highlights its card', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/boats?boatId=second-wind&tourId=fishing`);
    await expect(activeStep(page)).toContainText('Tours y paquetes');
    await expect(page.locator('#boat-tour-fishing')).toHaveClass(/admin-boat-tour-card--highlight/);
  } finally { await f.browser.close(); }
});

// --- Comidas de los paquetes: se escriben en inglés; el español lo genera DeepL (mockeado) al guardar -----------------

const openHalfDay = async (page) => {
  await openSecondWind(page);
  await goToStep(page, 'Tours y paquetes');
  await page.locator('.admin-boat-package-row').filter({ hasText: 'Half Day' }).getByRole('button', { name: 'Editar Half Day' }).click();
  return page.locator('.admin-package-compact-editor');
};
const packageWrites = (writes) => writes.filter((w) => w.table === 'tour_packages' && w.method === 'POST');

test('meals form: one English field per meal — no Español/Inglés field anywhere in the package form', async () => {
  const f = await fixture(); const { page } = f;
  try {
    const editor = await openHalfDay(page);
    await expect(editor.getByText('Comidas para elegir')).toBeVisible();
    await expect(editor.getByLabel('Comida 1', { exact: true })).toHaveValue('Fish casado');
    await expect(editor.getByLabel('Comida 2', { exact: true })).toHaveValue('Seafood pasta');
    await expect(editor.getByLabel(/Español|Inglés|English/)).toHaveCount(0);
    await expect(editor.getByText(/· Español|· Inglés/)).toHaveCount(0);
    await expect(editor.locator('.admin-package-meal')).toHaveCount(2);
    for (const row of await editor.locator('.admin-package-meal').all()) await expect(row.locator('input')).toHaveCount(1);
    await expect(editor.getByText('Escríbelas en inglés: el español se genera al guardar.')).toBeVisible();
    await expect(editor.getByText('Escribe los textos del paquete en inglés: el español se genera al guardar.')).toBeVisible();
  } finally { await f.browser.close(); }
});

test('meals: nothing is translated while typing, on blur, on opening the editor or when cancelling — only on Guardar paquete', async () => {
  const f = await fixture(); const { page, translateCalls } = f;
  try {
    const editor = await openHalfDay(page);
    await editor.getByRole('button', { name: 'Agregar comida' }).click();
    await editor.getByLabel('Comida 3', { exact: true }).pressSequentially('Mixed ceviche');
    await editor.getByLabel('Comida 3', { exact: true }).blur();
    await editor.getByLabel('Comida 1', { exact: true }).fill('Fish casado with rice');
    await page.waitForTimeout(600);
    assert.equal(translateCalls.length, 0);
    await editor.getByRole('button', { name: 'Cancelar' }).click();
    assert.equal(translateCalls.length, 0);
    await page.locator('.admin-boat-package-row').filter({ hasText: 'Half Day' }).getByRole('button', { name: 'Editar Half Day' }).click();
    const again = page.locator('.admin-package-compact-editor');
    await again.getByLabel('Comida 1', { exact: true }).fill('Fish casado with rice');
    await again.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.equal(translateCalls.length, 1);
  } finally { await f.browser.close(); }
});

test('meals: new English meals are translated EN -> ES in one batch on save and persisted as { es, en }', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    await page.getByRole('region', { name: 'Fishing Tour en Second Wind' }).getByRole('button', { name: 'Agregar paquete' }).click();
    const editor = page.locator('.admin-package-compact-editor');
    await editor.getByLabel('Nombre', { exact: true }).fill('With lunch');
    await editor.getByLabel('Precio base (USD)').fill('900');
    await editor.getByRole('button', { name: 'Agregar comida' }).click();
    await editor.getByLabel('Comida 1', { exact: true }).fill('Fish casado');
    await editor.getByRole('button', { name: 'Agregar comida' }).click();
    await editor.getByLabel('Comida 2', { exact: true }).fill('Seafood pasta');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.equal(translateCalls.length, 1, 'one batched call for name + meals');
    assert.deepEqual(translateCalls[0], { texts: ['With lunch', 'Fish casado', 'Seafood pasta'], targetLang: 'ES', sourceLang: 'EN' });
    const saved = packageWrites(writes).at(-1).body;
    assert.deepEqual(saved.meal_options, [{ es: 'Fish casado [ES]', en: 'Fish casado' }, { es: 'Seafood pasta [ES]', en: 'Seafood pasta' }]);
    assert.equal(saved.boat_tour_id, 'l1');
  } finally { await f.browser.close(); }
});

test('meals: editing a package without touching the meals does not translate again and keeps the stored Spanish', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    const editor = await openHalfDay(page);
    await editor.getByLabel('Precio base (USD)').fill('700');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.equal(translateCalls.length, 0, 'no translator call when no text changed');
    const saved = packageWrites(writes).at(-1).body;
    assert.equal(saved.base_price, 700);
    assert.deepEqual(saved.meal_options, [{ es: 'Casado con pescado', en: 'Fish casado' }, { es: 'Pasta con mariscos', en: 'Seafood pasta' }]);
    for (const column of ['name_en', 'name_es', 'description_en', 'description_es', 'package_included_es', 'package_included_en']) assert.equal(column in saved, false, `${column} must not be written when unchanged`);
  } finally { await f.browser.close(); }
});

test('meals: changing one meal retranslates only that one; the others keep their Spanish', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    const editor = await openHalfDay(page);
    await editor.getByLabel('Comida 1', { exact: true }).fill('Fish casado with rice');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.deepEqual(translateCalls.map((call) => call.texts), [['Fish casado with rice']]);
    assert.deepEqual(packageWrites(writes).at(-1).body.meal_options, [{ es: 'Fish casado with rice [ES]', en: 'Fish casado with rice' }, { es: 'Pasta con mariscos', en: 'Seafood pasta' }]);
  } finally { await f.browser.close(); }
});

test('meals: adding one meal to an existing package translates only the new one; removing one translates nothing', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    let editor = await openHalfDay(page);
    await editor.getByRole('button', { name: 'Agregar comida' }).click();
    await editor.getByLabel('Comida 3', { exact: true }).fill('Vegan salad');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.deepEqual(translateCalls.map((call) => call.texts), [['Vegan salad']]);
    assert.deepEqual(packageWrites(writes).at(-1).body.meal_options.map((meal) => meal.es), ['Casado con pescado', 'Pasta con mariscos', 'Vegan salad [ES]']);
    await page.locator('.admin-boat-package-row').filter({ hasText: 'Half Day' }).getByRole('button', { name: 'Editar Half Day' }).click();
    editor = page.locator('.admin-package-compact-editor');
    await editor.getByRole('button', { name: 'Eliminar comida 3' }).click();
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect.poll(() => packageWrites(writes).length).toBe(2);
    assert.equal(translateCalls.length, 1);
    assert.equal(packageWrites(writes).at(-1).body.meal_options.length, 2);
  } finally { await f.browser.close(); }
});

test('package name and description: English source, Spanish generated on create and edit, unchanged is not retranslated', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    await page.getByRole('region', { name: 'Fishing Tour en Second Wind' }).getByRole('button', { name: 'Agregar paquete' }).click();
    let editor = page.locator('.admin-package-compact-editor');
    await editor.getByLabel('Nombre', { exact: true }).fill('Sunset Special');
    await editor.getByLabel(/^Descripción/).fill('Private cruise with drinks.');
    await editor.getByLabel('Precio base (USD)').fill('450');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.deepEqual(translateCalls.map((call) => call.texts), [['Sunset Special', 'Private cruise with drinks.']]);
    let saved = packageWrites(writes).at(-1).body;
    assert.deepEqual([saved.name, saved.name_en, saved.name_es], ['Sunset Special', 'Sunset Special', 'Sunset Special [ES]']);
    assert.deepEqual([saved.description, saved.description_en, saved.description_es], ['Private cruise with drinks.', 'Private cruise with drinks.', 'Private cruise with drinks. [ES]']);
    // Edit: only the description changes -> only it is translated; the name copies are not written.
    await page.locator('.admin-boat-package-row').filter({ hasText: 'Sunset Special' }).getByRole('button', { name: 'Editar Sunset Special' }).click();
    editor = page.locator('.admin-package-compact-editor');
    await editor.getByLabel(/^Descripción/).fill('Private sunset cruise with drinks and snacks.');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect.poll(() => packageWrites(writes).length).toBe(2);
    assert.deepEqual(translateCalls.map((call) => call.texts).at(-1), ['Private sunset cruise with drinks and snacks.']);
    saved = packageWrites(writes).at(-1).body;
    assert.equal('name_es' in saved, false);
    assert.equal(saved.description_es, 'Private sunset cruise with drinks and snacks. [ES]');
  } finally { await f.browser.close(); }
});

test('package: if any translation fails the whole package is NOT saved (name/description/included/meals share one request) and the admin can retry', async () => {
  const f = await fixture({ translate: { fails: true } }); const { page, writes, translateCalls, state, translation } = f;
  try {
    const editor = await openHalfDay(page);
    const mark = writes.length;
    await editor.getByLabel('Precio base (USD)').fill('777');
    await editor.getByLabel(/^Descripción/).fill('Changed description');
    await editor.getByLabel('Comida 2', { exact: true }).fill('Seafood pasta with pesto');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: SPANISH_ERROR })).toBeVisible();
    assert.equal(translateCalls.length, 1, 'both changed texts went out together');
    assert.deepEqual(translateCalls[0].texts, ['Changed description', 'Seafood pasta with pesto']);
    assert.equal(writes.slice(mark).length, 0, 'not even the price is saved partially');
    const stored = state.packages.find((p) => p.id === 'p1');
    assert.deepEqual([stored.base_price, stored.meal_options[1]], [680, { es: 'Pasta con mariscos', en: 'Seafood pasta' }]);
    await expect(editor.getByLabel('Comida 2', { exact: true })).toHaveValue('Seafood pasta with pesto');
    // Unchanged content never needs DeepL: with only the price edited, saving works while it is down.
    await editor.getByLabel(/^Descripción/).fill('');
    await editor.getByLabel('Comida 2', { exact: true }).fill('Seafood pasta');
    translateCalls.length = 0;
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.equal(translateCalls.length, 0);
    translation.fails = false;
  } finally { await f.browser.close(); }

  const g = await fixture({ translate: { empty: true } });
  try {
    const editor = await openHalfDay(g.page);
    const mark = g.writes.length;
    await editor.getByLabel('Comida 1', { exact: true }).fill('Fish casado with rice');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(g.page.getByRole('alert').filter({ hasText: SPANISH_ERROR })).toBeVisible();
    assert.equal(g.writes.slice(mark).length, 0, 'an empty translation is a failure too');
  } finally { await g.browser.close(); }
});

// --- "Incluye" (package_included): the admin writes ENGLISH, DeepL generates the Spanish (EN -> ES) -------------------------
// package_included + package_included_en keep the English typed; package_included_es gets the translation.
// Meals keep their own direction (Spanish typed -> English generated), so they use separate requests.

const openThreeQuarterDay = async (page) => {
  await openSecondWind(page);
  await goToStep(page, 'Tours y paquetes');
  await page.locator('.admin-boat-package-row').filter({ hasText: '3/4 Day' }).getByRole('button', { name: 'Editar 3/4 Day' }).click();
  return page.locator('.admin-package-compact-editor');
};
const includedBox = (editor) => editor.getByLabel('Elementos incluidos, uno por línea');
const SPANISH_ERROR = 'No se pudo generar la traducción al español. Intenta nuevamente.';

test('Incluye: the list is written in English; a changed list is translated EN -> ES on save and all three columns are written together', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    const editor = await openThreeQuarterDay(page);
    // One textarea (English content), no Spanish/English pair.
    await expect(includedBox(editor)).toHaveValue('Drinks\nSnacks');
    await expect(editor.getByText('Escríbelos en inglés: el español se genera al guardar.')).toBeVisible();
    await expect(editor.getByLabel(/Inglés|English|Español/)).toHaveCount(0);
    await includedBox(editor).fill('Drinks\nSnacks\n  Towel  \n\n');
    await page.waitForTimeout(300);
    assert.equal(translateCalls.length, 0, 'nothing is translated before Guardar paquete');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.equal(translateCalls.length, 1);
    // English goes in as the source, Spanish comes out.
    assert.deepEqual(translateCalls[0], { texts: ['Drinks', 'Snacks', 'Towel'], targetLang: 'ES', sourceLang: 'EN' });
    const saved = packageWrites(writes).at(-1).body;
    assert.deepEqual(saved.package_included, ['Drinks', 'Snacks', 'Towel']);
    assert.deepEqual(saved.package_included_en, ['Drinks', 'Snacks', 'Towel'], 'EN = what the admin wrote');
    assert.deepEqual(saved.package_included_es, ['Drinks [ES]', 'Snacks [ES]', 'Towel [ES]'], 'ES = the DeepL translation');
    assert.deepEqual([saved.id, saved.boat_tour_id], ['p2', 'l1']);
  } finally { await f.browser.close(); }
});

test('Incluye: an unchanged list is not translated and its stored ES/EN copies are not touched', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    const editor = await openThreeQuarterDay(page);
    await editor.getByLabel('Precio base (USD)').fill('820');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.equal(translateCalls.length, 0);
    const saved = packageWrites(writes).at(-1).body;
    assert.equal(saved.base_price, 820);
    assert.deepEqual(saved.package_included, ['Drinks', 'Snacks']);
    assert.equal('package_included_es' in saved, false);
    assert.equal('package_included_en' in saved, false);
    // Same when the same items are retyped with different spacing/blank lines.
    await page.locator('.admin-boat-package-row').filter({ hasText: '3/4 Day' }).getByRole('button', { name: 'Editar 3/4 Day' }).click();
    await includedBox(page.locator('.admin-package-compact-editor')).fill(' Drinks \n\nSnacks ');
    await page.locator('.admin-package-compact-editor').getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect.poll(() => packageWrites(writes).length).toBe(2);
    assert.equal(translateCalls.length, 0);
    assert.equal('package_included_es' in packageWrites(writes).at(-1).body, false);
  } finally { await f.browser.close(); }
});

test('Incluye: if DeepL fails nothing is saved (message says "al español"), the previous EN/ES/price are kept and the admin can retry', async () => {
  const f = await fixture({ translate: { fails: true } }); const { page, writes, state, translateCalls, translation } = f;
  try {
    const editor = await openThreeQuarterDay(page);
    const mark = writes.length;
    await editor.getByLabel('Precio base (USD)').fill('999');
    await includedBox(editor).fill('Drinks\nTowel');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: SPANISH_ERROR })).toBeVisible();
    await expect(page.getByText('traducción al inglés')).toHaveCount(0);
    assert.equal(translateCalls.length, 1);
    assert.equal(writes.slice(mark).length, 0, 'not even the price is saved partially');
    const stored = state.packages.find((p) => p.id === 'p2');
    assert.deepEqual([stored.package_included, stored.package_included_en, stored.package_included_es, stored.base_price], [['Drinks', 'Snacks'], ['Drinks', 'Snacks'], ['Bebidas', 'Snacks (viejo)'], 800]);
    await expect(includedBox(editor)).toHaveValue('Drinks\nTowel');
    translation.fails = false;
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    const saved = packageWrites(writes).at(-1).body;
    assert.deepEqual([saved.package_included, saved.package_included_en, saved.package_included_es, saved.base_price], [['Drinks', 'Towel'], ['Drinks', 'Towel'], ['Drinks [ES]', 'Towel [ES]'], 999]);
  } finally { await f.browser.close(); }
});

test('Incluye: an empty translation from the service is a failure too, never stored', async () => {
  const f = await fixture({ translate: { empty: true } }); const { page, writes } = f;
  try {
    const editor = await openThreeQuarterDay(page);
    const mark = writes.length;
    await includedBox(editor).fill('Drinks\nTowel');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: SPANISH_ERROR })).toBeVisible();
    assert.equal(writes.slice(mark).length, 0);
  } finally { await f.browser.close(); }
});

test('Incluye: NULL still inherits the tour list and [] is still an explicit empty list — neither calls DeepL', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    let editor = await openThreeQuarterDay(page);
    await includedBox(editor).fill('');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect.poll(() => packageWrites(writes).length).toBe(1);
    let saved = packageWrites(writes).at(-1).body;
    assert.deepEqual([saved.package_included, saved.package_included_es, saved.package_included_en], [[], [], []]);
    assert.equal(translateCalls.length, 0, 'an empty list is never sent to DeepL');

    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    await page.locator('.admin-boat-package-row').filter({ hasText: '3/4 Day' }).getByRole('button', { name: 'Editar 3/4 Day' }).click();
    editor = page.locator('.admin-package-compact-editor');
    await expect(editor.getByRole('checkbox', { name: 'Personalizar lo incluido' })).toBeChecked(); // [] is a list of its own, not "inherit"
    await editor.getByRole('checkbox', { name: 'Personalizar lo incluido' }).uncheck();
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect.poll(() => packageWrites(writes).length).toBe(2);
    saved = packageWrites(writes).at(-1).body;
    assert.deepEqual([saved.package_included, saved.package_included_es, saved.package_included_en], [null, null, null]);
    assert.equal(translateCalls.length, 0);
    // A package that never customised its list (NULL) and is saved again writes no copies.
    await page.locator('.admin-boat-package-row').filter({ hasText: 'Half Day' }).getByRole('button', { name: 'Editar Half Day' }).click();
    await page.locator('.admin-package-compact-editor').getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect.poll(() => packageWrites(writes).length).toBe(3);
    saved = packageWrites(writes).at(-1).body;
    assert.equal(saved.package_included, null);
    assert.equal('package_included_es' in saved, false);
    assert.equal(translateCalls.length, 0);
  } finally { await f.browser.close(); }
});

test('Incluye: a new package translates name, English list and English meals together in ONE request', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    await openSecondWind(page);
    await goToStep(page, 'Tours y paquetes');
    await page.getByRole('region', { name: 'Fishing Tour en Second Wind' }).getByRole('button', { name: 'Agregar paquete' }).click();
    const editor = page.locator('.admin-package-compact-editor');
    await editor.getByLabel('Nombre', { exact: true }).fill('New');
    await editor.getByLabel('Precio base (USD)').fill('500');
    await editor.getByRole('checkbox', { name: 'Personalizar lo incluido' }).check();
    await includedBox(editor).fill('Ice');
    await editor.getByRole('button', { name: 'Agregar comida' }).click();
    await editor.getByLabel('Comida 1', { exact: true }).fill('Ceviche');
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.equal(translateCalls.length, 1);
    assert.deepEqual(translateCalls[0], { texts: ['New', 'Ice', 'Ceviche'], targetLang: 'ES', sourceLang: 'EN' });
    const saved = packageWrites(writes).at(-1).body;
    assert.deepEqual([saved.package_included, saved.package_included_en, saved.package_included_es], [['Ice'], ['Ice'], ['Ice [ES]']]);
    assert.deepEqual(saved.meal_options, [{ es: 'Ceviche [ES]', en: 'Ceviche' }]);
  } finally { await f.browser.close(); }
});

test('Incluye: a 50-item list (the database maximum) goes to DeepL in one request of 50; longer lists are batched by 50', async () => {
  const f = await fixture(); const { page, writes, translateCalls } = f;
  try {
    const editor = await openThreeQuarterDay(page);
    const items = Array.from({ length: 50 }, (_, n) => `Item ${n + 1}`);
    await includedBox(editor).fill(items.join('\n'));
    await editor.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
    await expect(page.getByText('Paquete guardado.')).toBeVisible();
    assert.deepEqual(translateCalls.map((call) => call.texts.length), [50]);
    const saved = packageWrites(writes).at(-1).body;
    assert.deepEqual(saved.package_included_en, items);
    assert.deepEqual(saved.package_included_es, items.map((item) => `${item} [ES]`));
  } finally { await f.browser.close(); }

  // The batching itself lives in the shared service: 52 boat-equipment items (English) prove 50 + 2.
  const g = await fixture(); const { page: equipmentPage, translateCalls: equipmentCalls, state } = g;
  try {
    await openSecondWind(equipmentPage);
    for (let n = 1; n <= 52; n += 1) {
      await equipmentPage.locator('#boat-equipment-input').fill(`Gear ${n}`);
      await equipmentPage.locator('#boat-equipment-input').press('Enter');
    }
    await equipmentPage.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(activeStep(equipmentPage)).toContainText('Galería');
    assert.deepEqual(equipmentCalls.map((call) => call.texts.length), [50, 2]);
    assert.equal(state.equipment.length, 52);
    assert.equal(state.equipment.every((item) => item.label_es === `${item.label_en} [ES]`), true);
  } finally { await g.browser.close(); }
});

test('boat Guardar (final save / publish) also translates changed content first; a DeepL failure never publishes', async () => {
  const f = await fixture({ boats: [boatRow('listo', 'Bote listo', 1, { active: false })], images: threeImages('listo'), equipment: [eqRow('e1', 'listo', 'GPS Garmin', 'Garmin GPS', 1)], translate: { fails: true } });
  const { page, writes, state, translateCalls, translation } = f;
  try {
    await page.goto(`${base}/admin/boats`);
    await page.getByRole('button', { name: 'Editar bote Bote listo' }).click();
    await page.getByLabel('Equipamiento 1').fill('Garmin GPS plotter');
    // Jump to the last step: Información is persisted on the way (Siguiente rule) — blocked while DeepL is down.
    await goToStep(page, 'Configuración');
    await expect(page.locator('.admin-boat-modal').getByText(SPANISH_ERROR)).toBeVisible();
    await expect(activeStep(page)).toContainText('Información');
    assert.equal(writes.length, 0);
    translation.fails = false;
    await goToStep(page, 'Configuración');
    await expect(activeStep(page)).toContainText('Configuración');
    assert.deepEqual(translateCalls.at(-1).texts, ['Garmin GPS plotter']);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Bote publicado.')).toBeVisible();
    assert.equal(state.boats[0].active, true);
    assert.deepEqual([state.equipment[0].label_en, state.equipment[0].label_es], ['Garmin GPS plotter', 'Garmin GPS plotter [ES]']);
    assert.equal(translateCalls.length, 2, 'the final save had nothing new to translate');
  } finally { await f.browser.close(); }
});
