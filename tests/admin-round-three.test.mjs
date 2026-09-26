// Third manual-review round: "clean list, edit inside the editor". Departure locations use the standard status control (no checkbox), the
// Galería has no Alt field and the standard status + delete card, Comentarios keep only Editar (and Aprobar while pending) in the table,
// the sidebar arrow has no bubble, the About texts have roomy fields, and Botes' gallery is the Tours gallery (one shared component).
// Same in-memory PostgREST pattern as the other admin tests (no real Supabase project, no real DeepL).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const primaryKey = (table) => (table === 'site_settings' || table === 'payment_methods' ? 'key' : 'id');

const review = (id, name, status, extra = {}) => ({ id, name, country: 'CR', quote: `Quote from ${name}`, quote_es: 'x', quote_en: `Quote from ${name}`, translated: true, rating: 5, status, featured: false, active: true, sort_order: 1, image_url: null, image_public_id: null, created_at: '2026-01-02T00:00:00Z', ...extra });
const seed = {
  reviews: [review('r-1', 'Ana', 'approved', { featured: true }), review('r-2', 'Ben', 'pending', { active: false, sort_order: 2 }), review('r-3', 'Cy', 'rejected', { active: false, sort_order: 3 })],
  departure_locations: [
    { id: 'd-1', name: 'Playas del Coco', description: 'Main dock', description_en: 'Main dock', description_es: 'Muelle principal', active: true, sort_order: 1, surcharge_amount: 0, currency: 'USD', is_default: false },
    { id: 'd-2', name: 'Hermosa', description: 'North', description_en: 'North', description_es: 'Norte', active: false, sort_order: 2, surcharge_amount: 10, currency: 'USD', is_default: false },
  ],
  gallery_images: [
    { id: 'g-1', title: 'Sunset', alt: 'Alt one', alt_en: 'Alt one', alt_es: 'Alt uno', category: 'fishing', image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', image_public_id: null, active: true, sort_order: 1 },
    { id: 'g-2', title: null, alt: 'Alt two', alt_en: 'Alt two', alt_es: 'Alt dos', category: 'boats', image_url: '', src: null, image_public_id: null, active: false, sort_order: 2 },
  ],
};

async function fixture(extraSeed = {}, viewport = { width: 1366, height: 1000 }) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport });
  const store = Object.fromEntries(Object.entries({ ...seed, ...extraSeed }).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
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
    if (path.endsWith('/rpc/list_admin_gallery_categories')) return route.fulfill({ json: ['fishing', 'boats'] });
    if (!path.includes('/rest/v1/') || path.includes('/rest/v1/rpc/')) return route.fulfill({ json: [] });
    const table = path.split('/').pop();
    const pk = primaryKey(table);
    store[table] ??= [];
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    if (method === 'GET' || method === 'HEAD') {
      const rows = store[table].filter((row) => matches(row, url.searchParams));
      return route.fulfill({ json: wantsObject ? rows[0] ?? null : rows, headers: { 'access-control-expose-headers': 'content-range', 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } });
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
  return { browser, page, store, writes };
}

const setTheme = (page, theme) => page.evaluate((value) => { window.localStorage.setItem('pft-admin-theme', value); document.documentElement.setAttribute('data-theme', value); }, theme);
const patches = (writes, table) => writes.filter((write) => write.table === table && write.method === 'PATCH');

// ---- Lugares de salida: the standard state control instead of a checkbox ---------------------------------------------------

test('Lugar de salida: Activo / Inactivo uses the standard status control (badge + Eye button), not a checkbox — and still persists `active`', async () => {
  const f = await fixture(); const { page, writes, store } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: /Editar lugar de salida Hermosa/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await expect(dialog.locator('.admin-check')).toHaveCount(0);
    await expect(dialog.getByText('Estado y visibilidad')).toBeVisible();
    const row = dialog.locator('.admin-tour-config-row');
    await expect(row.locator('.admin-badge')).toHaveText('Inactivo');
    const toggle = dialog.getByRole('button', { name: /Activar lugar/ });
    await expect(toggle).toHaveText('No visible');
    await expect(toggle.locator('svg.lucide-eye-off')).toHaveCount(1); // the icon is the current state
    await toggle.click();
    await expect(row.locator('.admin-badge')).toHaveText('Activo');
    await expect(dialog.getByRole('button', { name: /Desactivar lugar/ })).toHaveText('Visible');
    await expect(dialog.getByRole('button', { name: /Desactivar lugar/ }).locator('svg.lucide-eye')).toHaveCount(1);
    // Nothing is written until Guardar (same as the checkbox before), then `active` is persisted as before.
    assert.equal(patches(writes, 'departure_locations').length, 0);
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => store.departure_locations.find((location) => location.id === 'd-2').active).toBe(true);
    // Same look as the gallery editor's state card (one component).
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: /^Editar imagen/ }).first().click();
    const galleryCard = await page.getByRole('dialog').locator('.admin-tour-config-row').evaluate((el) => el.className);
    assert.match(galleryCard, /admin-tour-config-row--tour/);
  } finally { await f.browser.close(); }
});

// ---- Galería ------------------------------------------------------------------------------------------------------------------

test('Galería: no Alt field anywhere; the editor has the standard state + delete card; edit and delete keep working', async () => {
  const f = await fixture(); const { page, writes, store } = f;
  try {
    await page.goto(`${base}/admin/gallery`);
    // The list never shows the alt text either.
    await expect(page.locator('.admin-media-card')).toHaveCount(2);
    assert.doesNotMatch(await page.locator('.admin-media-grid').innerText(), /Alt one|Alt two/);
    await page.getByRole('button', { name: 'Editar imagen Sunset' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/^Alt/)).toHaveCount(0);
    await expect(dialog.getByText(/^Alt$/)).toHaveCount(0);
    await expect(dialog.getByLabel('Titulo', { exact: true })).toHaveCount(0);
    // Standard card: "Estado y visibilidad" with the delete inside it (no separate "Zona de peligro").
    await expect(dialog.getByText('Estado y visibilidad')).toBeVisible();
    await expect(dialog.getByText('Zona de peligro')).toHaveCount(0);
    await expect(dialog.locator('.admin-form-section')).toHaveCount(1);
    await expect(dialog.locator('.admin-tour-danger-row strong')).toHaveText('Eliminar imagen');
    await expect(dialog.locator('.admin-tour-config-divider')).toHaveCount(1);
    // Edit persists title / category / visibility, and never the alt columns.
    await dialog.getByRole('combobox', { name: 'Categoria' }).selectOption('boats');
    await dialog.getByRole('button', { name: /Ocultar imagen/ }).click();
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect.poll(() => store.gallery_images.find((image) => image.id === 'g-1').category).toBe('boats');
    const saved = patches(writes, 'gallery_images').at(-1).body;
    assert.equal(saved.active, false);
    assert.equal('title' in saved, false);
    assert.equal(store.gallery_images.find((image) => image.id === 'g-1').title, 'Sunset', 'the hidden title is left as it was');
    for (const column of ['alt', 'alt_en', 'alt_es']) assert.equal(column in saved, false);
    assert.equal(store.gallery_images.find((image) => image.id === 'g-1').alt_es, 'Alt uno', 'the stored alt is untouched');
    // Delete from inside the editor, with the confirmation.
    await dialog.getByRole('button', { name: 'Eliminar imagen' }).click();
    const confirm = page.getByRole('dialog').last();
    await expect(confirm.getByRole('button', { name: 'Eliminar' })).toBeVisible();
    await confirm.getByRole('button', { name: 'Eliminar' }).click();
    await expect.poll(() => store.gallery_images.some((image) => image.id === 'g-1')).toBe(false);
    await expect(page.locator('.admin-media-card')).toHaveCount(1);
  } finally { await f.browser.close(); }
});

// ---- Comentarios --------------------------------------------------------------------------------------------------------------

test('Comentarios: the table only carries Editar (and Aprobar while a comment is pending); everything else is inside the editor', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reviews`);
    const rows = page.locator('.admin-table tbody tr');
    await expect(rows).toHaveCount(3);
    const actions = (index) => rows.nth(index).locator('.admin-row-actions button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
    assert.deepEqual(await actions(0), ['Editar comentario de Ana']); // approved: just the pencil
    assert.deepEqual(await actions(1), ['Aprobar comentario de Ben', 'Editar comentario de Ben']); // pending: the first decision, then the pencil
    assert.deepEqual(await actions(2), ['Editar comentario de Cy']); // rejected
    await expect(page.getByRole('button', { name: /^(Rechazar|Ocultar|Mostrar|Destacar|Quitar de destacados|Eliminar) comentario/ })).toHaveCount(0);
    assert.ok((await rows.first().locator('.admin-row-actions').evaluate((el) => el.getBoundingClientRect().width)) <= 90, 'a slim actions column');
    // Header still says Acciones and the badges are Spanish.
    await expect(page.getByRole('columnheader', { name: 'Acciones' })).toBeVisible();
    await expect(rows.locator('.admin-badge')).toHaveText(['Aprobado', 'Pendiente', 'Rechazado']);
  } finally { await f.browser.close(); }
});

test('Comentarios: visibility, featured, moderation and delete are managed inside the editor (same writes as before)', async () => {
  const f = await fixture(); const { page, writes, store } = f;
  try {
    await page.goto(`${base}/admin/reviews`);
    await page.getByRole('button', { name: 'Editar comentario de Ana' }).click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByRole('heading', { name: 'Editar comentario' })).toBeVisible();
    await expect(editor).toContainText('Quote from Ana');
    await expect(editor.getByText('Moderación')).toBeVisible();
    await expect(editor.getByText('Estado y visibilidad')).toBeVisible();
    // Visibility (Eye = visible).
    const hide = editor.getByRole('button', { name: /Ocultar comentario/ });
    await expect(hide.locator('svg.lucide-eye')).toHaveCount(1);
    await hide.click();
    await expect.poll(() => store.reviews.find((row) => row.id === 'r-1').active).toBe(false);
    const show = editor.getByRole('button', { name: /Mostrar comentario/ });
    await expect(show.locator('svg.lucide-eye-off')).toHaveCount(1); // the editor follows the refreshed data
    // Featured.
    await editor.getByRole('button', { name: 'Quitar de destacados' }).click();
    await expect.poll(() => store.reviews.find((row) => row.id === 'r-1').featured).toBe(false);
    await expect(editor.getByRole('button', { name: 'Destacar comentario' })).toBeVisible();
    // Moderation: reject, then approve again.
    await editor.getByRole('button', { name: 'Rechazar comentario de Ana' }).click();
    await expect.poll(() => store.reviews.find((row) => row.id === 'r-1').status).toBe('rejected');
    await expect(editor.locator('.admin-tour-config-row').first().locator('.admin-badge')).toHaveText('Rechazado');
    await editor.getByRole('button', { name: 'Aprobar comentario de Ana' }).click();
    await expect.poll(() => store.reviews.find((row) => row.id === 'r-1').status).toBe('approved');
    assert.deepEqual(patches(writes, 'reviews').map((write) => Object.keys(write.body)[0]), ['active', 'featured', 'status', 'status']);
    // Delete: inside the editor, with its confirmation.
    await editor.getByRole('button', { name: 'Eliminar comentario', exact: true }).click();
    const confirm = page.getByRole('dialog').last();
    await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect.poll(() => store.reviews.some((row) => row.id === 'r-1')).toBe(false);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.admin-table tbody tr')).toHaveCount(2);
  } finally { await f.browser.close(); }
});

test('Comentarios: a pending comment can be approved from the table (first decision) and then only shows the pencil', async () => {
  const f = await fixture(); const { page, store } = f;
  try {
    await page.goto(`${base}/admin/reviews`);
    await page.getByRole('button', { name: 'Aprobar comentario de Ben' }).click();
    await expect.poll(() => store.reviews.find((row) => row.id === 'r-2').status).toBe('approved');
    await expect(page.getByRole('button', { name: 'Aprobar comentario de Ben' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Editar comentario de Ben' })).toBeVisible();
    // Keyboard: the editor opens with Enter, Escape closes it and focus returns to the pencil.
    const pencil = page.getByRole('button', { name: 'Editar comentario de Ben' });
    await pencil.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(pencil).toBeFocused();
    // Phone: no overflow, editor fits.
    await page.setViewportSize({ width: 390, height: 844 });
    await pencil.click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const box = await page.getByRole('dialog').locator('.admin-modal-shell').evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right }; });
    assert.ok(box.l >= 0 && box.r <= 390, `editor inside the phone viewport ${box.l}..${box.r}`);
  } finally { await f.browser.close(); }
});

// ---- About texts --------------------------------------------------------------------------------------------------------------

test('Sobre Nosotros: the text areas are wide and roomy (no tiny boxes), grow only inside sensible limits and never overflow the layout', async () => {
  const long = Array.from({ length: 14 }, (_, n) => `Paragraph ${n + 1} of a long story about the crew and the sea.`).join('\n\n');
  const f = await fixture({ site_settings: [{ key: 'about.story.en', value: long, type: 'textarea', active: true }, { key: 'about.preview_text.en', value: 'Short teaser.', type: 'textarea', active: true }] }); const { page } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    const story = page.getByLabel(/^Historia/);
    const teaser = page.getByLabel(/^Texto de inicio/);
    const description = page.getByLabel(/^Descripcion/);
    await expect(story).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      const dims = await page.evaluate(() => Object.fromEntries(['Historia', 'Texto de inicio', 'Descripcion'].map((label) => {
        const el = [...document.querySelectorAll('.admin-content-section label')].find((node) => node.querySelector('span')?.textContent.trim() === label)?.querySelector('textarea');
        const box = el.getBoundingClientRect();
        return [label, { w: Math.round(box.width), h: Math.round(box.height), resize: getComputedStyle(el).resize, max: getComputedStyle(el).maxHeight }];
      })));
      const container = await page.locator('.admin-content-section').evaluate((el) => Math.round(el.getBoundingClientRect().width));
      assert.ok(dims.Historia.w >= container * 0.85, `${theme}: full-width story (${dims.Historia.w} of ${container})`);
      assert.ok(dims.Historia.h >= 180 && dims.Historia.h <= 460, `${theme}: story area height ${dims.Historia.h}`);
      assert.ok(dims['Texto de inicio'].h >= 110 && dims.Descripcion.h >= 85, `${theme}: teaser ${dims['Texto de inicio'].h} / description ${dims.Descripcion.h}`);
      assert.equal(dims.Historia.resize, 'vertical');
      assert.notEqual(dims.Historia.max, 'none', `${theme}: bounded height`);
    }
    // A long text scrolls inside its own box; it never grows the page or overflows sideways.
    const overflow = await story.evaluate((el) => ({ inner: el.scrollHeight > el.clientHeight, page: document.documentElement.scrollWidth - innerWidth }));
    assert.equal(overflow.inner, true);
    assert.ok(overflow.page <= 0);
    // Editing stays comfortable: type at the end of a long text and it keeps its size.
    const before = (await story.boundingBox()).height;
    await story.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' And one more sentence.');
    assert.equal(Math.round((await story.boundingBox()).height), Math.round(before));
    await expect(story).toHaveValue(/one more sentence\.$/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok((await teaser.boundingBox()).width >= 250 && (await description.boundingBox()).width >= 250, 'usable width on a phone');
  } finally { await f.browser.close(); }
});

// ---- Sidebar ------------------------------------------------------------------------------------------------------------------

test('sidebar: the collapse arrow is just the arrow (no bubble / box), centered in the footer, with hover and keyboard focus', async () => {
  const f = await fixture(); const { page } = f;
  try {
    const toggle = page.locator('.admin-sidebar__toggle');
    for (const state of ['expanded', 'collapsed']) {
      const info = await toggle.evaluate((el) => {
        const s = getComputedStyle(el);
        const footer = el.closest('.admin-sidebar__footer').getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return { border: s.borderTopWidth, bg: s.backgroundColor, shadow: s.boxShadow, w: Math.round(box.width), h: Math.round(box.height), offset: Math.abs((box.left + box.width / 2) - (footer.left + footer.width / 2)), svg: el.querySelectorAll('svg').length };
      });
      assert.equal(info.border, '0px', `${state}: no border`);
      assert.equal(info.bg, 'rgba(0, 0, 0, 0)', `${state}: no filled bubble`);
      assert.equal(info.shadow, 'none');
      assert.ok(info.w >= 36 && info.h >= 36, `${state}: hit area ${info.w}x${info.h}`);
      assert.ok(info.offset <= 1.5, `${state}: centered (off by ${info.offset}px)`);
      assert.equal(info.svg, 1, `${state}: one arrow`);
      if (state === 'expanded') { await toggle.click(); await page.waitForTimeout(400); }
    }
    // Hover keeps it bubble-free but brighter; keyboard focus is visible; it still works with the keyboard.
    await toggle.hover();
    assert.equal(await toggle.evaluate((el) => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    await toggle.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.notEqual(await toggle.evaluate((el) => getComputedStyle(el).outlineStyle), 'none', 'visible focus ring');
    await page.keyboard.press('Enter');
    await expect(page.locator('#admin-sidebar').getByRole('button', { name: 'Colapsar menu' })).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAttribute('title', 'Colapsar menu');
    // Phone drawer: same bare arrow.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    assert.equal(await toggle.evaluate((el) => getComputedStyle(el).borderTopWidth), '0px');
    await toggle.click();
    await expect(page.locator('#admin-sidebar')).toHaveAttribute('aria-hidden', 'true');
  } finally { await f.browser.close(); }
});

// ---- Botes gallery = Tours gallery ---------------------------------------------------------------------------------------------

test('source: Botes and Tours render their photo gallery with the same component, and the boat-only cover / reorder tools are gone', async () => {
  const boats = await fs.readFile('src/pages/admin/AdminBoatsPage.tsx', 'utf8');
  const tours = await fs.readFile('src/pages/admin/AdminToursPage.tsx', 'utf8');
  for (const source of [boats, tours]) {
    assert.match(source, /import AdminImageSlots from '\.\.\/\.\.\/components\/admin\/AdminImageSlots'/);
    assert.equal((source.match(/<AdminImageSlots\b/g) ?? []).length, 1);
    assert.doesNotMatch(source, /admin-tour-image-slots|admin-tour-image-slot"/, 'no private slot markup');
  }
  assert.doesNotMatch(boats, /Marcar foto|Mover foto|admin-boat-slot-tools|setPrimaryImage|moveImage|de 6 imágenes/);
});

test('Sobre Nosotros / Portada: a big photo stays inside its summary card thumbnail (never covers the title or the state badge)', async () => {
  const big = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1800"><rect width="2400" height="1800" fill="#456"/></svg>')}`;
  const f = await fixture({ site_settings: [1, 2, 3, 4].map((n) => ({ key: `about.carousel_${n}.image`, value: big, type: 'image', active: true })) }); const { page } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    const cards = page.locator('.admin-media-grid .admin-media-card');
    await expect(cards.first().locator('img')).toBeVisible();
    await page.waitForTimeout(300);
    const boxes = await cards.evaluateAll((nodes) => nodes.slice(0, 4).map((node) => {
      const card = node.getBoundingClientRect();
      const image = node.querySelector('img').getBoundingClientRect();
      const title = node.querySelector('strong').getBoundingClientRect();
      return { imageInsideThumb: image.top >= card.top - 1 && image.bottom <= card.bottom + 1 && image.width <= card.width + 1, titleBelowImage: title.top >= image.bottom - 1 };
    }));
    for (const box of boxes) assert.deepEqual(box, { imageInsideThumb: true, titleBelowImage: true });
  } finally { await f.browser.close(); }
});
