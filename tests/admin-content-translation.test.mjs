// End-to-end translation flows of the Admin modules that are NOT the Tours / Botes wizards:
//   Hero + About (site_settings), Lugares de salida (departure_locations) and Galería (gallery_images).
// The administrator writes ENGLISH; on every save DeepL (mocked here, never called for real) generates the Spanish
// copy, and only for what changed. If the translation fails nothing is persisted.
// Same mock-fixture pattern as the other admin tests: an in-memory PostgREST stand-in, no real Supabase project.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { mockTranslation, SPANISH_ERROR } from './support/translation-mock.mjs';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const primaryKey = (table) => (table === 'site_settings' ? 'key' : 'id');

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
      const upsert = (request.headers().prefer ?? '').includes('resolution=merge-duplicates');
      const saved = list.map((item) => {
        const existing = upsert ? store[table].find((row) => row[pk] === item[pk]) : null;
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
  const translation = await mockTranslation(page);

  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, writes, store, translation };
}

const writesTo = (writes, table, method) => writes.filter((w) => w.table === table && (!method || w.method === method));

// ------------------------------------------------------------------------------------------------------------
// Lugares de salida: description is public and bilingual; the name is a place name (never translated)
// ------------------------------------------------------------------------------------------------------------

const location = { id: 'loc-1', name: 'Playas del Coco', slug: 'coco', description: 'Boat leaves from the main pier.', description_en: null, description_es: null, surcharge_amount: 0, currency: 'USD', active: true, sort_order: 1, is_default: true };

test('departure locations: the description is English-only in the form; a changed description is translated EN -> ES and saved with both copies', async () => {
  const f = await fixture({ departure_locations: [location] }); const { page, writes, translation } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: 'Editar lugar de salida Playas del Coco' }).click();
    await expect(page.getByLabel(/^Descripcion/)).toHaveValue('Boat leaves from the main pier.');
    await expect(page.getByLabel(/Español|Inglés|English/)).toHaveCount(0);
    await page.getByLabel(/^Descripcion/).fill('Boat leaves from the new marina.');
    await page.waitForTimeout(300);
    assert.equal(translation.calls.length, 0, 'not while typing');
    await page.getByRole('button', { name: /Guardar/ }).click();
    await expect(page.getByText('Lugar actualizado.')).toBeVisible();
    assert.deepEqual(translation.calls, [{ texts: ['Boat leaves from the new marina.'], targetLang: 'ES', sourceLang: 'EN' }]);
    const saved = writesTo(writes, 'departure_locations', 'PATCH').at(-1).body;
    assert.deepEqual([saved.description, saved.description_en, saved.description_es], ['Boat leaves from the new marina.', 'Boat leaves from the new marina.', 'Boat leaves from the new marina. [ES]']);
    assert.equal(saved.name, 'Playas del Coco');
    assert.equal('name_es' in saved, false, 'a place name is never translated');
  } finally { await f.browser.close(); }
});

test('departure locations: unchanged description is not translated or rewritten; a failed translation saves nothing', async () => {
  const f = await fixture({ departure_locations: [location] }); const { page, writes, translation } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: 'Editar lugar de salida Playas del Coco' }).click();
    await page.getByLabel('Cargo adicional').fill('15');
    await page.getByRole('button', { name: /Guardar/ }).click();
    await expect(page.getByText('Lugar actualizado.')).toBeVisible();
    assert.equal(translation.calls.length, 0);
    const saved = writesTo(writes, 'departure_locations', 'PATCH').at(-1).body;
    assert.equal(saved.surcharge_amount, 15);
    assert.equal('description_es' in saved, false);
    assert.equal('description_en' in saved, false);

    translation.fails = true;
    await page.getByRole('button', { name: 'Editar lugar de salida Playas del Coco' }).click();
    await page.getByLabel(/^Descripcion/).fill('Changed while DeepL is down.');
    const before = writes.length;
    await page.getByRole('button', { name: /Guardar/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: SPANISH_ERROR })).toBeVisible();
    assert.equal(writes.length, before, 'nothing is persisted when the translation fails');
    await expect(page.getByLabel(/^Descripcion/)).toHaveValue('Changed while DeepL is down.');
    translation.fails = false;
    await page.getByRole('button', { name: /Guardar/ }).click();
    await expect(page.getByText('Lugar actualizado.')).toBeVisible();
    assert.equal(writesTo(writes, 'departure_locations', 'PATCH').at(-1).body.description_es, 'Changed while DeepL is down. [ES]');
  } finally { await f.browser.close(); }
});

test('departure locations: CREATE translates the description before inserting the row (and never the name)', async () => {
  const f = await fixture({ departure_locations: [] }); const { page, writes, translation, store } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: 'Nuevo lugar' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Tamarindo');
    await page.getByLabel(/^Descripcion/).fill('Pickup at the beach club.');
    await page.getByRole('button', { name: /Guardar/ }).click();
    await expect(page.getByText('Lugar creado.')).toBeVisible();
    assert.equal(translation.calls.length, 1);
    const insert = writesTo(writes, 'departure_locations', 'POST')[0].body;
    assert.deepEqual([insert.name, insert.description, insert.description_en, insert.description_es], ['Tamarindo', 'Pickup at the beach club.', 'Pickup at the beach club.', 'Pickup at the beach club. [ES]']);
    assert.equal('name_es' in insert, false);
    assert.equal(store.departure_locations.length, 1);
  } finally { await f.browser.close(); }
});

// ------------------------------------------------------------------------------------------------------------
// Galería: alt text is public and bilingual; title is an admin-only label (not shown on the landing)
// ------------------------------------------------------------------------------------------------------------

const galleryImage = { id: 'gal-1', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', image_public_id: null, alt: 'Boat at dock', alt_en: null, alt_es: null, category: 'boats', title: 'Dock', active: true, sort_order: 1 };

test('gallery: alt text is written in English and its Spanish copy is generated on Guardar cambios — only when it changed', async () => {
  const f = await fixture({ gallery_images: [galleryImage] }); const { page, writes, translation } = f;
  try {
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Editar imagen Boat at dock' }).click();
    await expect(page.getByLabel(/^Alt/)).toHaveValue('Boat at dock');
    // Unchanged alt: no translation, no alt_es/alt_en written.
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Cambios de galería guardados.').first()).toBeVisible();
    assert.equal(translation.calls.length, 0);
    let saved = writesTo(writes, 'gallery_images', 'PATCH').at(-1).body;
    assert.equal('alt_es' in saved, false);
    // Changed alt: translated EN -> ES.
    await page.getByLabel(/^Alt/).fill('Fishing boat at sunset');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect.poll(() => translation.calls.length).toBe(1);
    assert.deepEqual(translation.calls[0], { texts: ['Fishing boat at sunset'], targetLang: 'ES', sourceLang: 'EN' });
    await expect.poll(() => writesTo(writes, 'gallery_images', 'PATCH').length).toBe(2);
    saved = writesTo(writes, 'gallery_images', 'PATCH').at(-1).body;
    assert.deepEqual([saved.alt, saved.alt_en, saved.alt_es], ['Fishing boat at sunset', 'Fishing boat at sunset', 'Fishing boat at sunset [ES]']);
    assert.equal('title_es' in saved, false, 'the title is not shown publicly and is not translated');
  } finally { await f.browser.close(); }
});

test('gallery: a failed translation saves nothing (Guardar cambios and closing the modal) and keeps the typed alt', async () => {
  const f = await fixture({ gallery_images: [galleryImage] }); const { page, writes, translation } = f;
  try {
    translation.fails = true;
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Editar imagen Boat at dock' }).click();
    await page.getByLabel(/^Alt/).fill('Fishing boat at sunset');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert').filter({ hasText: SPANISH_ERROR })).toBeVisible();
    assert.equal(writesTo(writes, 'gallery_images', 'PATCH').length, 0);
    await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    await expect(page.getByLabel(/^Alt/)).toHaveValue('Fishing boat at sunset');
    assert.equal(writesTo(writes, 'gallery_images', 'PATCH').length, 0, 'closing must not persist an untranslated alt either');
    translation.fails = false;
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect.poll(() => writesTo(writes, 'gallery_images', 'PATCH').length).toBe(1);
    assert.equal(writesTo(writes, 'gallery_images', 'PATCH')[0].body.alt_es, 'Fishing boat at sunset [ES]');
  } finally { await f.browser.close(); }
});

test('gallery: a new image starts with a fixed bilingual alt ("New image" / "Nueva imagen"), no DeepL call', async () => {
  const f = await fixture({ gallery_images: [] }); const { page, writes, translation } = f;
  try {
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Nueva imagen' }).click();
    await expect.poll(() => writesTo(writes, 'gallery_images', 'POST').length).toBe(1);
    const insert = writesTo(writes, 'gallery_images', 'POST')[0].body;
    assert.deepEqual([insert.alt, insert.alt_en, insert.alt_es], ['New image', 'New image', 'Nueva imagen']);
    assert.equal(translation.calls.length, 0);
  } finally { await f.browser.close(); }
});

// ------------------------------------------------------------------------------------------------------------
// Hero + About (site_settings): English keys are edited, `.es` keys are generated and hidden
// ------------------------------------------------------------------------------------------------------------

const heroRows = [
  { key: 'home.hero.title.en', value: 'Experience the Ocean', type: 'text', active: true },
  { key: 'home.hero.title.es', value: 'Experimenta el oceano', type: 'text', active: true },
  { key: 'home.hero.subtitle.en', value: 'World-class fishing.', type: 'textarea', active: true },
  { key: 'home.hero.subtitle.es', value: 'Pesca de clase mundial.', type: 'textarea', active: true },
  { key: 'about.story.en', value: 'Our story in English.\n\nSecond paragraph.', type: 'textarea', active: true },
  { key: 'about.story.es', value: 'Nuestra historia.\n\nSegundo párrafo.', type: 'textarea', active: true },
];

test('hero: only the English texts are editable; changing one translates just it and writes its .es key', async () => {
  const f = await fixture({ site_settings: heroRows }); const { page, writes, translation, store } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    await expect(page.getByLabel('Titulo principal', { exact: true })).toHaveValue('Experience the Ocean');
    // No Spanish field, no ES/EN language filter.
    await expect(page.getByLabel('Titulo principal ES')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Filtrar por idioma' })).toHaveCount(0);
    await expect(page.getByText('Escríbelos en inglés: el español se genera al guardar.').first()).toBeVisible();
    await page.getByLabel('Titulo principal', { exact: true }).fill('Experience the Pacific');
    await page.waitForTimeout(300);
    assert.equal(translation.calls.length, 0, 'not while typing');
    await page.getByRole('button', { name: 'Guardar portada' }).click();
    await expect(page.getByText(/Portada actualizada/)).toBeVisible();
    assert.deepEqual(translation.calls, [{ texts: ['Experience the Pacific'], targetLang: 'ES', sourceLang: 'EN' }]);
    const settings = Object.fromEntries(store.site_settings.map((row) => [row.key, row.value]));
    assert.equal(settings['home.hero.title.en'], 'Experience the Pacific');
    assert.equal(settings['home.hero.title.es'], 'Experience the Pacific [ES]');
    // The subtitle did not change: its Spanish is left exactly as it was.
    assert.equal(settings['home.hero.subtitle.es'], 'Pesca de clase mundial.');
    assert.equal(writesTo(writes, 'site_settings', 'POST').some((w) => w.body.key === 'home.hero.subtitle.es'), false);
  } finally { await f.browser.close(); }
});

test('hero: saving without changes does not call DeepL and does not touch any .es key; a failure persists nothing', async () => {
  const f = await fixture({ site_settings: heroRows }); const { page, writes, translation } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    await expect(page.getByLabel('Titulo principal', { exact: true })).toHaveValue('Experience the Ocean');
    await page.getByRole('button', { name: 'Guardar portada' }).click();
    await expect(page.getByText(/Portada actualizada/)).toBeVisible();
    assert.equal(translation.calls.length, 0);
    assert.equal(writesTo(writes, 'site_settings', 'POST').some((w) => String(w.body.key).endsWith('.es')), false);

    translation.fails = true;
    await page.getByLabel('Titulo principal', { exact: true }).fill('Experience the Pacific');
    const before = writes.length;
    await page.getByRole('button', { name: 'Guardar portada' }).click();
    await expect(page.getByRole('alert').filter({ hasText: SPANISH_ERROR }).or(page.getByText(SPANISH_ERROR)).first()).toBeVisible();
    assert.equal(writes.length, before, 'nothing (not even the English) is saved when the translation fails');
    await expect(page.getByLabel('Titulo principal', { exact: true })).toHaveValue('Experience the Pacific');
  } finally { await f.browser.close(); }
});

test('about: a long multi-paragraph English text is translated as one text and its .es key is written', async () => {
  const f = await fixture({ site_settings: heroRows }); const { page, translation, store } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    const story = page.getByLabel(/^Historia \(pagina Nosotros\)/);
    await expect(story).toHaveValue('Our story in English.\n\nSecond paragraph.');
    await story.fill('Our new story.\n\nWith two paragraphs.');
    await page.getByRole('button', { name: 'Guardar Sobre Nosotros' }).click();
    await expect(page.getByText(/Sobre Nosotros actualizado/)).toBeVisible();
    assert.deepEqual(translation.calls.map((call) => call.texts), [['Our new story.\n\nWith two paragraphs.']]);
    const settings = Object.fromEntries(store.site_settings.map((row) => [row.key, row.value]));
    assert.equal(settings['about.story.en'], 'Our new story.\n\nWith two paragraphs.');
    assert.equal(settings['about.story.es'], 'Our new story.\n\nWith two paragraphs. [ES]');
  } finally { await f.browser.close(); }
});

// ------------------------------------------------------------------------------------------------------------
// "Reparar traducciones antiguas" (translate-all-site-content): backfill tool, never part of the daily flow
// ------------------------------------------------------------------------------------------------------------

test('repair button: clearly a backfill tool, asks for confirmation, shows the per-table result, and normal saves never call it', async () => {
  const f = await fixture({ site_settings: heroRows }); const { page, translation } = f;
  const repairCalls = [];
  try {
    await page.route('https://admin-test.supabase.co/functions/v1/translate-all-site-content', async (route) => {
      repairCalls.push(route.request().method());
      return route.fulfill({ json: { results: [{ table: 'tours', label: 'Tours', updated: 2, skipped: 6, errors: 0 }, { table: 'gallery_images', label: 'Galería', updated: 0, skipped: 8, errors: 1 }], totalErrors: 1, hasMore: false } });
    });
    await page.goto(`${base}/admin/portada`);
    await expect(page.getByRole('heading', { name: 'Reparar traducciones antiguas' })).toBeVisible();
    await expect(page.getByText('no necesitas este botón para tus ediciones normales')).toBeVisible();
    await expect(page.getByText('Traducir todo el sitio')).toHaveCount(0);
    // A normal save translates through translate-texts and never triggers the repair function.
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    await page.getByLabel('Titulo principal', { exact: true }).fill('Experience the Pacific');
    await page.getByRole('button', { name: 'Guardar portada' }).click();
    await expect(page.getByText(/Portada actualizada/)).toBeVisible();
    assert.equal(translation.calls.length, 1);
    assert.equal(repairCalls.length, 0);
    // The repair button asks first; nothing runs until confirmed.
    await page.getByRole('button', { name: 'Traducir contenido antiguo' }).click();
    await expect(page.getByRole('heading', { name: 'Reparar traducciones antiguas', level: 2 }).last()).toBeVisible();
    assert.equal(repairCalls.length, 0);
    await page.getByRole('button', { name: 'Traducir', exact: true }).click();
    await expect(page.getByText('Traducción completada')).toBeVisible();
    await expect(page.getByText('Tours: 2 actualizados, 6 sin cambios')).toBeVisible();
    await expect(page.getByText('Galería: 0 actualizados, 8 sin cambios, 1 con errores')).toBeVisible();
    assert.equal(repairCalls.length, 1);
  } finally { await f.browser.close(); }
});

test('repair button: a server error is reported clearly and nothing is shown as completed', async () => {
  const f = await fixture({ site_settings: heroRows }); const { page } = f;
  try {
    await page.route('https://admin-test.supabase.co/functions/v1/translate-all-site-content', (route) => route.fulfill({ status: 503, json: { message: 'La traducción automática todavía no está configurada (falta el secret DEEPL_API_KEY en Supabase).' } }));
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Traducir contenido antiguo' }).click();
    await page.getByRole('button', { name: 'Traducir', exact: true }).click();
    await expect(page.getByText('todavía no está configurada')).toBeVisible();
    await expect(page.getByText('Traducción completada')).toHaveCount(0);
  } finally { await f.browser.close(); }
});
