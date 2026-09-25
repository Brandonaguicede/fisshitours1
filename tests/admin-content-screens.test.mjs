// Admin content screens: "Portada" (the home Hero, and nothing else) and "Sobre Nosotros" (its own screen and route).
// Same in-memory PostgREST + mocked DeepL pattern as the other admin tests: no real Supabase project, no real DeepL.
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
const setting = (store, key) => store.site_settings.find((row) => row.key === key)?.value;

const contentRows = [
  { key: 'home.hero.title.en', value: 'Experience the Ocean', type: 'text', active: true },
  { key: 'home.hero.title.es', value: 'Experimenta el oceano', type: 'text', active: true },
  { key: 'about.title.en', value: 'About title', type: 'text', active: true },
  { key: 'about.title.es', value: 'Titulo nosotros', type: 'text', active: true },
  { key: 'about.image_alt.en', value: 'Crew alt', type: 'text', active: true },
  { key: 'about.image_alt.es', value: 'Alt tripulacion', type: 'text', active: true },
  { key: 'about.story.en', value: 'Story one.\n\nStory two.', type: 'textarea', active: true },
  { key: 'about.story.es', value: 'Historia uno.\n\nHistoria dos.', type: 'textarea', active: true },
  { key: 'about.carousel_1.image', value: 'https://example.test/site-images/general/abc/one.jpg', type: 'image', active: true },
  { key: 'about.image', value: 'https://example.test/site-images/general/abc/five.jpg', type: 'image', active: true },
];

// Everything the admin can see (visible text plus accessible names / titles) inside `scope` (default: the whole page).
async function visibleAdminText(page, scope = 'body') {
  return page.evaluate((selector) => [
    document.querySelector(selector).innerText,
    ...[...document.querySelectorAll(`${selector} [aria-label],${selector} [title],${selector} [alt],${selector} [placeholder]`)].map((el) => ['aria-label', 'title', 'alt', 'placeholder'].map((name) => el.getAttribute(name) ?? '').join(' ')),
  ].join('\n'), scope);
}

// ---- navigation / routing ---------------------------------------------------------------------------------

test('sidebar: "Portada" and "Sobre Nosotros" are two separate entries, and no admin-visible label says Hero', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page } = f;
  try {
    const sidebar = page.locator('#admin-sidebar');
    await expect(sidebar.getByRole('link', { name: 'Portada', exact: true })).toHaveAttribute('href', '/admin/portada');
    await expect(sidebar.getByRole('link', { name: 'Sobre Nosotros', exact: true })).toHaveAttribute('href', '/admin/sobre-nosotros');
    await expect(sidebar.getByRole('link', { name: /hero/i })).toHaveCount(0);

    await sidebar.getByRole('link', { name: 'Portada', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/portada$/);
    await expect(page.locator('.admin-page').getByRole('heading', { level: 1, name: 'Portada' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Portada', exact: true })).toHaveClass(/admin-sidebar__link--active/);
    await expect(sidebar.getByRole('link', { name: 'Sobre Nosotros', exact: true })).not.toHaveClass(/admin-sidebar__link--active/);

    await sidebar.getByRole('link', { name: 'Sobre Nosotros', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/sobre-nosotros$/);
    await expect(page.locator('.admin-page').getByRole('heading', { level: 1, name: 'Sobre Nosotros' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Sobre Nosotros', exact: true })).toHaveClass(/admin-sidebar__link--active/);
    await expect(sidebar.getByRole('link', { name: 'Portada', exact: true })).not.toHaveClass(/admin-sidebar__link--active/);
  } finally { await f.browser.close(); }
});

test('old bookmarks keep working: /admin/content -> Portada, /admin/content?tab=about -> Sobre Nosotros, /admin/videos -> Portada', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page } = f;
  try {
    await page.goto(`${base}/admin/content`);
    await expect(page).toHaveURL(/\/admin\/portada$/);
    await expect(page.getByRole('button', { name: 'Guardar portada' })).toBeVisible();

    await page.goto(`${base}/admin/content?tab=about`);
    await expect(page).toHaveURL(/\/admin\/sobre-nosotros$/);
    await expect(page.getByRole('button', { name: 'Guardar Sobre Nosotros' })).toBeVisible();

    await page.goto(`${base}/admin/videos`);
    await expect(page).toHaveURL(/\/admin\/portada$/);
  } finally { await f.browser.close(); }
});

// ---- Portada: Hero only ----------------------------------------------------------------------------------------

test('Portada is a Hero-only screen: Media / Textos / Imágenes / Video, no About tab or field, and no "Hero" label anywhere', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await expect(page.getByRole('heading', { level: 2, name: 'Portada' })).toBeVisible();
    // The only inner tabs are Media and Textos: About is not a tab of this screen any more.
    const tabs = page.getByRole('navigation', { name: 'Secciones de Portada' }).getByRole('button');
    await expect(tabs).toHaveText(['Media', 'Textos']);
    await expect(page.getByRole('button', { name: /Nosotros|About/ })).toHaveCount(0);
    await expect(page.getByLabel('Secciones de contenido editable')).toHaveCount(0);

    // Media / Imágenes
    await expect(page.getByText('Fondo de la Portada')).toBeVisible();
    await expect(page.getByText('Slide 1 - compu')).toBeVisible();
    assert.doesNotMatch(await visibleAdminText(page), /hero/i);
    assert.doesNotMatch(await visibleAdminText(page, '.admin-content-page'), /carrusel about|sobre nosotros/i);
    // Media / Video
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    await expect(page.getByText('Video de fondo', { exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Tipo de fondo de la Portada' })).toBeVisible();
    assert.doesNotMatch(await visibleAdminText(page), /hero/i);
    assert.doesNotMatch(await visibleAdminText(page, '.admin-content-page'), /carrusel about|sobre nosotros/i);
    await page.getByRole('button', { name: 'Imágenes', exact: true }).click();
    // Textos
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    await expect(page.getByLabel('Titulo principal', { exact: true })).toHaveValue('Experience the Ocean');
    await expect(page.getByLabel(/^Historia \(pagina Nosotros\)/)).toHaveCount(0);
    await expect(page.getByLabel('Titulo', { exact: true })).toHaveCount(0);
    assert.doesNotMatch(await visibleAdminText(page), /hero/i);
    assert.doesNotMatch(await visibleAdminText(page, '.admin-content-page'), /carrusel about|sobre nosotros/i);
  } finally { await f.browser.close(); }
});

test('Portada: switching Imágenes / Video keeps working and is announced to assistive tech', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page, writes } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    const images = page.getByRole('button', { name: 'Imágenes', exact: true });
    const video = page.getByRole('button', { name: 'Video', exact: true });
    await expect(images).toHaveAttribute('aria-pressed', 'true');
    await expect(video).toHaveAttribute('aria-pressed', 'false');
    await video.click();
    await expect(page.getByText('Modo de la Portada cambiado a video')).toBeVisible();
    await expect(video).toHaveAttribute('aria-pressed', 'true');
    const write = writesTo(writes, 'site_settings', 'POST').find((w) => w.body.key === 'home.hero.media_mode');
    assert.equal(write.body.value, 'video');
  } finally { await f.browser.close(); }
});

// ---- Sobre Nosotros: same fields, persistence and EN -> ES flow, on its own route -------------------------------

test('Sobre Nosotros keeps every About field, image and alt text, and has no Hero controls', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    await expect(page.getByRole('heading', { level: 2, name: 'Sobre Nosotros' })).toBeVisible();
    // Textareas are matched by prefix: their current text is part of the label's text content.
    for (const label of ['Titulo', /^Descripcion/, /^Texto de inicio \(home\)/, /^Historia \(pagina Nosotros\)/, 'Titulo final', /^Texto final/, 'Texto alternativo imagen']) {
      await expect(page.getByLabel(label, { exact: typeof label === 'string' })).toBeVisible();
    }
    // English only: the generated Spanish copy is never shown.
    await expect(page.getByLabel('Titulo ES')).toHaveCount(0);
    await expect(page.getByLabel('Titulo', { exact: true })).toHaveValue('About title');
    await expect(page.getByLabel('Texto alternativo imagen', { exact: true })).toHaveValue('Crew alt');
    for (const n of [1, 2, 3, 4]) await expect(page.getByText(`Carrusel About - foto ${n}`, { exact: true })).toBeVisible();
    await expect(page.getByText('Carrusel About - foto 5 (opcional)')).toBeVisible();
    // The saved images are the ones shown (fotos 1 and 5), not defaults.
    await expect(page.locator('.admin-image-manager__preview img[src="https://example.test/site-images/general/abc/one.jpg"]')).toHaveCount(1);
    await expect(page.locator('.admin-image-manager__preview img[src="https://example.test/site-images/general/abc/five.jpg"]')).toHaveCount(1);
    // No Hero controls on this screen.
    await expect(page.getByRole('button', { name: 'Textos', exact: true })).toHaveCount(0);
    await expect(page.getByText('Fondo de la Portada')).toHaveCount(0);
    await expect(page.getByLabel('Titulo principal')).toHaveCount(0);
    assert.doesNotMatch(await visibleAdminText(page), /hero/i);
    assert.doesNotMatch(await visibleAdminText(page, '.admin-content-page'), /portada/i);
  } finally { await f.browser.close(); }
});

test('Sobre Nosotros: saving translates only what changed (title + alt), persists EN and ES, and touches nothing of the Hero', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page, writes, translation, store } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    await expect(page.getByLabel('Titulo', { exact: true })).toHaveValue('About title');
    await page.getByLabel('Titulo', { exact: true }).fill('New about title');
    await page.getByLabel('Texto alternativo imagen', { exact: true }).fill('New crew alt');
    await page.getByRole('button', { name: 'Guardar Sobre Nosotros' }).click();
    await expect(page.getByText(/Sobre Nosotros actualizado/)).toBeVisible();

    assert.deepEqual(translation.calls.map((call) => [...call.texts].sort()), [['New about title', 'New crew alt']]);
    assert.equal(translation.calls[0].targetLang, 'ES');
    assert.equal(translation.calls[0].sourceLang, 'EN');
    assert.equal(setting(store, 'about.title.en'), 'New about title');
    assert.equal(setting(store, 'about.title.es'), 'New about title [ES]');
    assert.equal(setting(store, 'about.image_alt.en'), 'New crew alt');
    assert.equal(setting(store, 'about.image_alt.es'), 'New crew alt [ES]');
    // Untouched texts keep their Spanish; no Hero key is ever written from this screen; images are not rewritten by a text save.
    assert.equal(setting(store, 'about.story.es'), 'Historia uno.\n\nHistoria dos.');
    const written = writesTo(writes, 'site_settings', 'POST').map((w) => w.body.key);
    assert.equal(written.some((key) => key.startsWith('home.hero.')), false);
    assert.equal(written.some((key) => key.endsWith('.image') || key.includes('.carousel_')), false);
    assert.equal(setting(store, 'about.carousel_1.image'), 'https://example.test/site-images/general/abc/one.jpg');
  } finally { await f.browser.close(); }
});

// Key inventory, taken from the Hero/About tabs as they were before the split (src/pages/admin/AdminContentPage.tsx @ 6d7cb26):
// every editable text is written as `<base>.en` and its `<base>.es` is generated by DeepL. The eyebrow / button labels of About
// and the Hero CTA buttons were already not editable at that commit, so they are (deliberately) not part of this inventory.
const ABOUT_TEXT_KEYS = ['about.title', 'about.description', 'about.preview_text', 'about.story', 'about.cta_title', 'about.cta_text', 'about.image_alt'];
const HERO_TEXT_KEYS = ['home.hero.title', 'home.hero.eyebrow', 'home.hero.subtitle', 'home.hero.image_alt'];

test('Sobre Nosotros preserves the complete About key inventory: 7 editable texts (EN saved, ES generated) and nothing extra', async () => {
  const f = await fixture({ site_settings: [] }); const { page, writes, translation, store } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    await expect(page.getByLabel('Titulo', { exact: true })).not.toHaveValue('');
    // A save without edits rewrites exactly the 7 English keys (defaults), and calls DeepL for none of them.
    await page.getByRole('button', { name: 'Guardar Sobre Nosotros' }).click();
    await expect(page.getByText(/Sobre Nosotros actualizado/)).toBeVisible();
    assert.deepEqual(writesTo(writes, 'site_settings', 'POST').map((w) => w.body.key).sort(), ABOUT_TEXT_KEYS.map((key) => `${key}.en`).sort());
    assert.equal(translation.calls.length, 0);

    // Edit every field: each one persists its EN key and gets its ES generated.
    writes.length = 0;
    const fields = [
      [page.getByLabel('Titulo', { exact: true }), 'about.title', 'T'],
      [page.getByLabel(/^Descripcion/), 'about.description', 'D'],
      [page.getByLabel(/^Texto de inicio \(home\)/), 'about.preview_text', 'P1\n\nP2'],
      [page.getByLabel(/^Historia \(pagina Nosotros\)/), 'about.story', 'S1\n\nS2'],
      [page.getByLabel('Titulo final', { exact: true }), 'about.cta_title', 'CT'],
      [page.getByLabel(/^Texto final/), 'about.cta_text', 'CX'],
      [page.getByLabel('Texto alternativo imagen', { exact: true }), 'about.image_alt', 'ALT'],
    ];
    for (const [input, , value] of fields) await input.fill(value);
    await page.getByRole('button', { name: 'Guardar Sobre Nosotros' }).click();
    await expect(page.getByText(/Sobre Nosotros actualizado/).first()).toBeVisible();
    assert.equal(translation.calls.length, 1);
    assert.deepEqual([...translation.calls[0].texts].sort(), fields.map(([, , value]) => value).sort());
    for (const [, key, value] of fields) {
      assert.equal(setting(store, `${key}.en`), value, `${key}.en`);
      assert.equal(setting(store, `${key}.es`), `${value} [ES]`, `${key}.es`);
    }
    assert.equal(store.site_settings.filter((row) => row.key.startsWith('about.')).length, ABOUT_TEXT_KEYS.length * 2);
    // Clearing a text falls back to the public default in EN and ES (validation / fallback preserved).
    await page.getByLabel('Titulo', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Guardar Sobre Nosotros' }).click();
    await expect.poll(() => setting(store, 'about.title.es')).toBe('Pasión local y excelencia en el Pacífico de Costa Rica');
    assert.equal(setting(store, 'about.title.en'), "Local passion and excellence on Costa Rica's Pacific coast");
  } finally { await f.browser.close(); }
});

test('Portada preserves the complete Hero key inventory: media mode + 4 editable texts (EN saved, ES generated), CTA buttons still not editable', async () => {
  const f = await fixture({ site_settings: [] }); const { page, writes, translation, store } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar portada' }).click();
    await expect(page.getByText(/Portada actualizada/)).toBeVisible();
    assert.deepEqual(writesTo(writes, 'site_settings', 'POST').map((w) => w.body.key).sort(), ['home.hero.media_mode', ...HERO_TEXT_KEYS.map((key) => `${key}.en`)].sort());
    assert.equal(translation.calls.length, 0);

    writes.length = 0;
    const fields = [['Titulo principal', 'home.hero.title', 'HT'], ['Etiqueta', 'home.hero.eyebrow', 'HE'], ['Subtitulo', 'home.hero.subtitle', 'HS'], ['Texto alternativo imagen', 'home.hero.image_alt', 'HA']];
    for (const [label, , value] of fields) await page.getByLabel(label, { exact: label !== 'Subtitulo' }).fill(value);
    await page.getByRole('button', { name: 'Guardar portada' }).click();
    await expect(page.getByText(/Portada actualizada/).first()).toBeVisible();
    assert.deepEqual([...translation.calls[0].texts].sort(), fields.map(([, , value]) => value).sort());
    for (const [, key, value] of fields) {
      assert.equal(setting(store, `${key}.en`), value, `${key}.en`);
      assert.equal(setting(store, `${key}.es`), `${value} [ES]`, `${key}.es`);
    }
    for (const label of [/Boton principal/i, /Boton secundario/i, /Enlace boton/i]) await expect(page.getByText(label)).toHaveCount(0);
  } finally { await f.browser.close(); }
});

test('Sobre Nosotros: a DeepL failure persists nothing and keeps what was typed; an unchanged save does not call DeepL', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page, writes, translation } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    await expect(page.getByLabel('Titulo', { exact: true })).toHaveValue('About title');
    await page.getByRole('button', { name: 'Guardar Sobre Nosotros' }).click();
    await expect(page.getByText(/Sobre Nosotros actualizado/)).toBeVisible();
    assert.equal(translation.calls.length, 0);

    translation.fails = true;
    await page.getByLabel('Titulo', { exact: true }).fill('Broken title');
    const before = writes.length;
    await page.getByRole('button', { name: 'Guardar Sobre Nosotros' }).click();
    await expect(page.getByText(SPANISH_ERROR).first()).toBeVisible();
    assert.equal(writes.length, before);
    await expect(page.getByLabel('Titulo', { exact: true })).toHaveValue('Broken title');
  } finally { await f.browser.close(); }
});

// ---- Admin -> public: the About copy saved from the new screen is what the public home renders ---------------------

test('public home renders the About copy saved from the new Sobre Nosotros screen (EN and ES)', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page, store } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    await page.getByLabel('Titulo', { exact: true }).fill('Public about title');
    await page.getByRole('button', { name: 'Guardar Sobre Nosotros' }).click();
    await expect(page.getByText(/Sobre Nosotros actualizado/)).toBeVisible();
    assert.equal(setting(store, 'about.title.es'), 'Public about title [ES]');

    for (const [language, expected] of [['en', 'Public about title'], ['es', 'Public about title [ES]']]) {
      await page.evaluate((value) => window.localStorage.setItem('language', value), language);
      await page.goto(`${base}/`);
      const accept = page.getByRole('dialog').getByRole('button', { name: /Aceptar|Accept/i });
      if (await accept.isVisible().catch(() => false)) await accept.click();
      await expect(page.locator('#about').getByRole('heading', { name: expected, exact: true })).toBeVisible({ timeout: 15000 });
    }
  } finally { await f.browser.close(); }
});

// ---- dark / light / responsive / keyboard -------------------------------------------------------------------------

async function setTheme(page, theme) {
  await page.evaluate((value) => { window.localStorage.setItem('pft-admin-theme', value); document.documentElement.setAttribute('data-theme', value); }, theme);
}

test('Portada looks coherent in light and dark: flat inner tabs and preview (no shadow / glow / white outline / gradient), readable preview text', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await page.getByRole('button', { name: 'Media', exact: true }).click();
      await page.waitForTimeout(400); // .admin-tab animates its background for 160ms
      const tabs = await page.evaluate(() => {
        const bar = getComputedStyle(document.querySelector('.admin-content-section .admin-tabs'));
        const active = getComputedStyle(document.querySelector('.admin-content-section .admin-tab--active'));
        const segmented = getComputedStyle(document.querySelector('.admin-content-section .admin-segmented__option--active'));
        return { barShadow: bar.boxShadow, activeImage: active.backgroundImage, activeBg: active.backgroundColor, activeColor: active.color, segBg: segmented.backgroundColor, segColor: segmented.color };
      });
      assert.equal(tabs.barShadow, 'none', `${theme}: inner tabs have no shadow`);
      assert.equal(tabs.activeImage, 'none', `${theme}: active tab is a flat fill, not a gradient`);
      assert.equal(tabs.activeColor, 'rgb(255, 255, 255)');
      assert.equal(tabs.segBg, tabs.activeBg, `${theme}: Imágenes/Video switch uses the same active fill as the tabs`);
      assert.equal(tabs.segColor, 'rgb(255, 255, 255)');

      await page.getByRole('button', { name: 'Textos', exact: true }).click();
      const preview = await page.evaluate(() => {
        const box = getComputedStyle(document.querySelector('.admin-content-preview'));
        const eyebrow = getComputedStyle(document.querySelector('.admin-content-preview__eyebrow'));
        const lead = getComputedStyle(document.querySelector('.admin-content-preview__lead'));
        return { shadow: box.boxShadow, border: box.borderTopColor, eyebrow: eyebrow.color, lead: lead.color };
      });
      assert.equal(preview.shadow, 'none', `${theme}: preview has no glow`);
      assert.notEqual(preview.border, 'rgba(255, 255, 255, 0.7)', `${theme}: preview has no white outline`);
      assert.match(preview.eyebrow, /^rgba?\(255, 255, 255/, `${theme}: preview eyebrow is white on the dark preview`);
      assert.match(preview.lead, /^rgba?\(255, 255, 255/, `${theme}: preview subtitle is white on the dark preview`);
    }
  } finally { await f.browser.close(); }
});

test('Portada and Sobre Nosotros have no horizontal overflow on a phone-width viewport and the tabs stay usable', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page } = f;
  try {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const path of ['/admin/portada', '/admin/sobre-nosotros']) {
      await page.goto(`${base}${path}`);
      await expect(page.locator('.admin-content-section')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${path}: page overflows horizontally by ${overflow}px`);
    }
    await page.goto(`${base}/admin/portada`);
    const box = await page.getByRole('button', { name: 'Textos', exact: true }).boundingBox();
    assert.ok(box.height >= 32 && box.width >= 44, 'inner tab is a usable touch target');
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    await expect(page.getByLabel('Titulo principal', { exact: true })).toBeVisible();
  } finally { await f.browser.close(); }
});

test('keyboard: sidebar links, inner tabs and the Imágenes/Video switch are reachable and operable without a mouse', async () => {
  const f = await fixture({ site_settings: contentRows }); const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    // Sidebar: focus "Sobre Nosotros" by keyboard and activate it with Enter.
    await page.locator('#admin-sidebar').getByRole('link', { name: 'Sobre Nosotros', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/admin\/sobre-nosotros$/);
    await page.locator('#admin-sidebar').getByRole('link', { name: 'Portada', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/admin\/portada$/);

    // Inner tabs: Space and Enter both switch, the pressed state follows, and focus shows a visible ring.
    const textos = page.getByRole('button', { name: 'Textos', exact: true });
    await textos.focus();
    await page.keyboard.press('Space');
    await expect(textos).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Titulo principal', { exact: true })).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Media', exact: true })).toBeFocused();
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert.notEqual(outline, 'none', 'keyboard focus is visible on the inner tabs');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Media', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Fondo de la Portada')).toBeVisible();
    // Imágenes / Video switch by keyboard.
    await page.getByRole('button', { name: 'Video', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Video', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } finally { await f.browser.close(); }
});
