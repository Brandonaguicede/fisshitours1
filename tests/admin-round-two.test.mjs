// Second manual-review round: no translation copy anywhere in the Admin, fixed contact CTA, "Crear" on the manual booking, the shared
// primary style of modal footers, and the compact Portada / Sobre Nosotros editors with a real Hero preview (video / image, computer /
// phone). Same in-memory PostgREST pattern as the other admin tests (no real Supabase project, no real DeepL).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const primaryKey = (table) => (table === 'site_settings' || table === 'payment_methods' ? 'key' : 'id');

const site = (key, value) => ({ key, value, type: key.includes('video') && !key.includes('poster') ? 'video' : key.includes('image') || key.includes('poster') ? 'image' : 'text', active: true });
const HERO_TEXTS = [
  site('home.hero.eyebrow.en', 'Private charters - Costa Rica'),
  site('home.hero.title.en', 'Experience the Ocean'),
  site('home.hero.subtitle.en', 'World-class fishing, stunning views, and unforgettable memories.'),
  site('home.hero.image_alt.en', 'Private boat sailing Costa Rica Pacific waters'),
];
const ABOUT_IMAGES = ['/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg', '/about/IMG_1020 (1).jpeg', '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg', '/galeria/IMG_9407.jpeg'];

async function fixture(seed = {}, viewport = { width: 1366, height: 1000 }) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport });
  const store = Object.fromEntries(Object.entries(seed).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
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
      return route.fulfill({ json: wantsObject ? rows[0] ?? null : rows, headers: { 'access-control-expose-headers': 'content-range', 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } });
    }
    const body = method === 'DELETE' ? undefined : request.postDataJSON();
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
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, store };
}

const setTheme = (page, theme) => page.evaluate((value) => { window.localStorage.setItem('pft-admin-theme', value); document.documentElement.setAttribute('data-theme', value); }, theme);
const primaryFill = (locator) => locator.evaluate((el) => {
  const probe = document.createElement('i'); probe.style.background = 'var(--admin-primary)'; document.body.appendChild(probe);
  const out = { bg: getComputedStyle(el).backgroundColor, primary: getComputedStyle(probe).backgroundColor, color: getComputedStyle(el).color }; probe.remove(); return out;
});

// ---- Copy ------------------------------------------------------------------------------------------------------------------

const TRANSLATION_COPY = /se genera al guardar|Escr[ií]bel[oa]s? en ingl[eé]s|Escribe los textos|en ingl[eé]s: el espa[nñ]ol|Nombre propio: no se traduce|p[aá]rrafos separados por l[ií]nea vac[ií]a|Posición actual:|Orden actual:|Orden de aparición actual|Se reordena desde la lista/i;

test('source guard: no Admin screen carries copy that explains the translation, paragraph separators or the position helper', async () => {
  const files = [];
  for (const dir of ['src/pages/admin', 'src/components/admin']) for (const name of await fs.readdir(dir)) if (name.endsWith('.tsx')) files.push(`${dir}/${name}`);
  const offenders = [];
  for (const file of files) {
    const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line) || /\{\/\*/.test(line.trim().slice(0, 3))) return; // comments are not visible copy
      if (TRANSLATION_COPY.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('no translation / paragraph / position copy is visible on the content screens, the departure and gallery editors', async () => {
  const f = await fixture({ site_settings: HERO_TEXTS, departure_locations: [{ id: 'd-1', name: 'Coco', description: 'Dock', description_en: 'Dock', description_es: 'Muelle', active: true, sort_order: 1, surcharge_amount: 0, currency: 'USD', is_default: false }], gallery_images: [{ id: 'g-1', title: 'One', alt: 'Alt one', category: 'fishing', image_url: '', active: true, sort_order: 1 }] });
  const { page } = f;
  try {
    const visible = () => page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('[aria-label],[title],[placeholder]')].map((el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.getAttribute('placeholder') ?? ''}`)].join('\n'));
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    assert.doesNotMatch(await visible(), TRANSLATION_COPY, 'Portada / Textos');
    await expect(page.locator('.admin-content-section p', { hasText: /^Textos$/ })).toBeVisible();
    await page.goto(`${base}/admin/sobre-nosotros`);
    await expect(page.getByLabel(/^Historia/)).toBeVisible();
    assert.doesNotMatch(await visible(), TRANSLATION_COPY, 'Sobre Nosotros');
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: /Nuevo lugar/ }).click();
    await expect(page.getByLabel(/^Descripción/)).toBeVisible();
    assert.doesNotMatch(await visible(), TRANSLATION_COPY, 'Lugar de salida (nuevo)');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Editar lugar de salida/ }).click();
    assert.doesNotMatch(await visible(), TRANSLATION_COPY, 'Lugar de salida (editar)');
    await page.keyboard.press('Escape');
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: /Editar imagen/ }).first().click();
    assert.doesNotMatch(await visible(), TRANSLATION_COPY, 'Galería (editar)');
  } finally { await f.browser.close(); }
});

// ---- Sobre Nosotros: fixed contact CTA, compact carousel cards and preview -----------------------------------------------

test('Sobre Nosotros: "Título final" / "Texto final" are not editable any more and the paragraph helpers are gone from the labels', async () => {
  const f = await fixture({ site_settings: [site('about.cta_title.en', 'Old title'), site('about.cta_text.en', 'Old text'), site('about.title.en', 'About title')] });
  const { page } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    await expect(page.getByLabel('Titulo', { exact: true })).toHaveValue('About title');
    await expect(page.getByLabel(/Titulo final|Texto final/)).toHaveCount(0);
    await expect(page.getByText(/Titulo final|Texto final/)).toHaveCount(0);
    const labels = await page.locator('.admin-content-section label').evaluateAll((nodes) => nodes.map((node) => node.querySelector('span')?.textContent?.trim()).filter(Boolean));
    for (const expected of ['Titulo', 'Descripcion', 'Texto de inicio', 'Historia', 'Texto alternativo imagen']) assert.ok(labels.includes(expected), `label "${expected}" in ${labels}`);
    // Saving never writes the CTA keys any more.
    const writes = [];
    page.on('request', (request) => { if (request.method() === 'POST' && request.url().includes('/site_settings')) writes.push(request.postDataJSON()); });
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText(/Sobre Nosotros actualizado/)).toBeVisible();
    assert.equal(writes.flat().some((row) => String(row.key).includes('cta_')), false);
  } finally { await f.browser.close(); }
});

test('Sobre Nosotros carousel: a clean list of summary cards (state + pencil only); replace / delete live in the editor; order and previews intact', async () => {
  const rows = [...ABOUT_IMAGES.map((src, index) => site(`about.carousel_${index + 1}.image`, index === 0 ? 'https://example.test/site-images/general/abc/one.jpg' : src)), site('about.title.en', 'About title'), site('about.preview_text.en', 'First paragraph.\n\nSecond paragraph.')];
  const f = await fixture({ site_settings: rows }); const { page } = f;
  try {
    await page.goto(`${base}/admin/sobre-nosotros`);
    const cards = page.locator('.admin-media-grid .admin-media-card');
    await expect(cards).toHaveCount(5);
    // Order 1..5 (the fifth is the optional one) and one line of state per card.
    await expect(cards.locator('strong')).toHaveText(['Carrusel About - foto 1', 'Carrusel About - foto 2', 'Carrusel About - foto 3', 'Carrusel About - foto 4', 'Carrusel About - foto 5 (opcional)']);
    await expect(cards.locator('.admin-badge')).toHaveText(['Activo', 'Activo', 'Activo', 'Activo', 'Sin imagen']);
    // The list carries ONLY the pencil: no Cambiar / Subir / Eliminar / URL controls outside the editor.
    for (let index = 0; index < 5; index += 1) {
      const buttons = await cards.nth(index).getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
      assert.deepEqual(buttons, [`Editar Carrusel About - foto ${index + 1}${index === 4 ? ' (opcional)' : ''}`]);
    }
    await expect(page.getByRole('button', { name: /^Cambiar$|Subir imagen|^Eliminar/ })).toHaveCount(0);
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      const dims = await cards.evaluateAll((nodes) => nodes.map((node) => ({ card: Math.round(node.getBoundingClientRect().height), fit: node.querySelector('img') ? getComputedStyle(node.querySelector('img')).objectFit : 'none' })));
      for (const item of dims) assert.ok(item.card <= 300, `${theme}: compact card ${JSON.stringify(item)}`);
      assert.deepEqual([...new Set(dims.map((item) => item.fit))].filter((fit) => fit !== 'none'), ['cover']);
    }
    // The editor: replace + delete (+ path) for an image that lives in storage; the empty fifth offers Subir imagen.
    await cards.nth(0).getByRole('button', { name: /^Editar/ }).click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByRole('heading', { name: 'Editar Carrusel About - foto 1' })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Cambiar', exact: true })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Eliminar' })).toBeVisible();
    await expect(editor.locator('.admin-image-manager__path')).toContainText('general/abc/one.jpg');
    await editor.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await cards.nth(4).getByRole('button', { name: /^Editar/ }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /Subir imagen/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cards.nth(4).getByRole('button', { name: /^Editar/ })).toBeFocused(); // focus returns to the pencil that opened the editor
    // The preview keeps its thumbnails.
    const preview = await page.locator('.admin-about-preview').evaluate((node) => ({ h: Math.round(node.getBoundingClientRect().height), thumbs: node.querySelectorAll('.admin-about-preview__thumbs img').length }));
    assert.ok(preview.h <= 230 && preview.thumbs >= 4, JSON.stringify(preview));
    // Phone: no overflow, still only pencils.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await expect(page.getByRole('button', { name: /^Cambiar$|Eliminar/ })).toHaveCount(0);
  } finally { await f.browser.close(); }
});

test('Sobre Nosotros carousel: deleting an image from its editor still works (default restored) and the list shows the new state', async () => {
  const rows = [site('about.carousel_1.image', 'https://example.test/site-images/general/abc/one.jpg')];
  const f = await fixture({ site_settings: rows }); const { page, store } = f;
  const deletes = [];
  try {
    await page.route('https://admin-test.supabase.co/functions/v1/storage-delete-image', async (route) => { deletes.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); });
    await page.goto(`${base}/admin/sobre-nosotros`);
    await page.getByRole('button', { name: 'Editar Carrusel About - foto 1' }).click();
    const editor = page.getByRole('dialog');
    await editor.getByRole('button', { name: 'Eliminar' }).click();
    await expect(editor.getByRole('button', { name: '¿Confirmar eliminar?' })).toBeVisible();
    await editor.getByRole('button', { name: '¿Confirmar eliminar?' }).click();
    await expect.poll(() => deletes.length).toBe(1);
    assert.equal(deletes[0].storagePath, 'general/abc/one.jpg');
    // The reference falls back to the default photo (persisted), and the editor stays open until "Listo".
    await expect.poll(() => store.site_settings.find((row) => row.key === 'about.carousel_1.image')?.value).toBe('/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await editor.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('.admin-media-card').first().locator('img')).toHaveAttribute('src', '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg');
  } finally { await f.browser.close(); }
});

// ---- Portada: compact media editor + real preview ------------------------------------------------------------------------

const heroSeed = (mode, extra = []) => [
  ...HERO_TEXTS,
  site('home.hero.media_mode', mode),
  site('home.hero.image', '/images/placeholder-image.jpg'),
  site('home.hero.mobile_image', '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg'),
  site('home.hero.video', '/videos/hero-papagayo-desktop-v2.mp4'),
  site('home.hero.mobile_video', '/videos/hero-papagayo-mobile-v2.mp4'),
  site('home.hero.video_poster', '/images/hero-papagayo-poster-v2.webp'),
  ...extra,
];

test('Portada / Media: images and videos are summary cards (state + pencil); replace / delete / R2 URL live in each editor', async () => {
  const f = await fixture({ site_settings: heroSeed('image') }); const { page, store } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    const cards = page.locator('.admin-media-grid .admin-media-card');
    await expect(cards.locator('strong')).toHaveText(['Slide 1 - compu', 'Slide 1 - celular']);
    await expect(cards.locator('.admin-badge')).toHaveText(['Activo', 'Activo']);
    for (let index = 0; index < 2; index += 1) {
      const labels = await cards.nth(index).getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
      assert.equal(labels.length, 1);
      assert.match(labels[0], /^Editar Slide 1/);
    }
    assert.ok((await cards.evaluateAll((nodes) => Math.max(...nodes.map((node) => node.getBoundingClientRect().height)))) <= 300, 'compact cards');
    await expect(page.getByRole('button', { name: /^Cambiar$|Subir|Eliminar/ })).toHaveCount(0);
    // Extra slides stay behind their own toggle, also as summary cards.
    await page.getByRole('button', { name: /Mostrar diapositivas adicionales/ }).click();
    await expect(page.locator('.admin-media-grid').nth(1).locator('.admin-media-card')).toHaveCount(6);
    // Image editor.
    await cards.first().getByRole('button', { name: /^Editar/ }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Editar Slide 1 - compu' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cambiar', exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
    // Video mode: the two videos and the poster, again only a pencil each.
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    const videoCards = page.locator('.admin-media-grid .admin-media-card');
    await expect(videoCards.locator('strong')).toHaveText(['Video de fondo', 'Video de fondo - celular', 'Imagen mientras carga el video']);
    await expect(videoCards.locator('.admin-badge')).toHaveText(['Activo', 'Activo', 'Activo']);
    await expect(page.getByRole('button', { name: /^Cambiar$|Usar URL|Eliminar/ })).toHaveCount(0);
    await expect(page.getByLabel('O usa un video ya subido a R2')).toHaveCount(0);
    // Video editor: replace, R2 URL (+ Usar URL) and the player — nothing is lost.
    await videoCards.first().getByRole('button', { name: /^Editar/ }).click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByRole('button', { name: 'Cambiar', exact: true })).toBeVisible();
    await expect(editor.locator('video')).toBeVisible();
    assert.ok((await editor.locator('video').evaluate((el) => el.getBoundingClientRect().height)) <= 245, 'bounded player');
    await expect(editor.getByText(/evita pasar archivos grandes|Sube primero el archivo en R2/)).toHaveCount(0);
    await editor.getByLabel('O usa un video ya subido a R2').fill('https://pub-test.r2.dev/videos/new.mp4');
    await editor.getByRole('button', { name: 'Usar URL' }).click();
    await expect.poll(() => store.site_settings.find((row) => row.key === 'home.hero.video')?.value).toBe('https://pub-test.r2.dev/videos/new.mp4');
    await expect(page.getByRole('dialog')).toHaveCount(1); // still open after saving the URL
    await editor.getByRole('button', { name: 'Cerrar', exact: true }).click();
    // The preview keeps working with the new configuration.
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    await expect(page.locator('.admin-hero-preview__frame')).toBeVisible();
    await expect(page.locator('.admin-hero-preview__title')).toContainText('Experience');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no overflow on a phone');
  } finally { await f.browser.close(); }
});

test('Portada preview (video mode): plays the REAL configured background video with poster, overlay and the texts, for computer and phone', async () => {
  const f = await fixture({ site_settings: heroSeed('video') }); const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    const frame = page.locator('.admin-hero-preview__frame');
    await expect(frame).toHaveAttribute('data-media', 'video');
    const video = frame.locator('video');
    await expect(video).toHaveAttribute('src', '/videos/hero-papagayo-desktop-v2.mp4');
    await expect(video).toHaveAttribute('poster', '/images/hero-papagayo-poster-v2.webp');
    // The video really loads and plays (muted, looping, inline) — same background the landing plays.
    await expect.poll(() => video.evaluate((el) => ({ ready: el.readyState >= 2, playing: !el.paused, muted: el.muted, loop: el.loop })), { timeout: 20000 }).toEqual({ ready: true, playing: true, muted: true, loop: true });
    await expect(frame.locator('img.admin-hero-preview__media')).toHaveAttribute('src', '/images/hero-papagayo-poster-v2.webp'); // poster behind it
    // Overlay + texts on top, from the Textos fields (English).
    assert.ok((await frame.locator('.admin-hero-preview__overlay').evaluate((el) => getComputedStyle(el).backgroundColor)).startsWith('rgba('), 'overlay');
    await expect(frame.locator('.admin-hero-preview__eyebrow')).toHaveText('Private charters - Costa Rica');
    await expect(frame.getByRole('heading', { level: 3 })).toContainText('Experience');
    await expect(frame.getByRole('heading', { level: 3 })).toContainText('the Ocean');
    await expect(frame.locator('.admin-hero-preview__subtitle')).toContainText('World-class fishing');
    // Editing a text updates the preview live.
    await page.getByLabel('Titulo principal', { exact: true }).fill('Fish the Pacific');
    await expect(frame.getByRole('heading', { level: 3 })).toContainText('Fish');
    // Compact, not a full-screen hero.
    const box = await frame.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    assert.ok(box.w <= 500 && box.h <= 280, `compact preview ${box.w}x${box.h}`);
    // Phone context: the phone video, in a phone-shaped frame.
    await page.getByRole('button', { name: 'Celular', exact: true }).click();
    await expect(page.locator('.admin-hero-preview__frame--mobile video')).toHaveAttribute('src', '/videos/hero-papagayo-mobile-v2.mp4');
    await expect.poll(() => page.locator('.admin-hero-preview__frame--mobile video').evaluate((el) => !el.paused && el.readyState >= 2), { timeout: 20000 }).toBe(true);
    const phone = await page.locator('.admin-hero-preview__frame--mobile').evaluate((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    assert.ok(phone.w <= 200 && phone.h <= 260 && phone.h > phone.w, `phone frame ${phone.w}x${phone.h}`);
    // Light and dark Admin: the preview stays legible.
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      const colors = await page.evaluate(() => ({ title: getComputedStyle(document.querySelector('.admin-hero-preview__title')).color, sub: getComputedStyle(document.querySelector('.admin-hero-preview__subtitle')).color }));
      assert.match(colors.title, /^rgb\(255, 255, 255\)/, theme);
      assert.match(colors.sub, /^rgba?\(255, 255, 255/, theme);
    }
  } finally { await f.browser.close(); }
});

test('Portada preview (image mode): shows the real configured image for the chosen context and never invents media', async () => {
  const f = await fixture({ site_settings: heroSeed('image') }); const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    const frame = page.locator('.admin-hero-preview__frame');
    await expect(frame).toHaveAttribute('data-media', 'image');
    await expect(frame.locator('video')).toHaveCount(0);
    const img = frame.locator('img.admin-hero-preview__media');
    await expect(img).toHaveAttribute('src', '/images/placeholder-image.jpg');
    await expect(img).toHaveAttribute('alt', 'Private boat sailing Costa Rica Pacific waters');
    await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
    assert.equal(await img.evaluate((el) => getComputedStyle(el).objectFit), 'cover');
    await page.getByRole('button', { name: 'Celular', exact: true }).click();
    const phoneImg = page.locator('.admin-hero-preview__frame--mobile img.admin-hero-preview__media');
    await expect(phoneImg).toHaveAttribute('src', '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg');
    await expect.poll(() => phoneImg.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.admin-hero-preview__eyebrow')).toBeVisible();
  } finally { await f.browser.close(); }

  // Only a computer image is configured: the phone context shows an honest empty state, not the wrong image.
  const g = await fixture({ site_settings: [...HERO_TEXTS, site('home.hero.media_mode', 'image'), site('home.hero.image', '/images/placeholder-image.jpg')] });
  try {
    await g.page.goto(`${base}/admin/portada`);
    await g.page.getByRole('button', { name: 'Textos', exact: true }).click();
    await g.page.getByRole('button', { name: 'Celular', exact: true }).click();
    await expect(g.page.locator('.admin-hero-preview__frame--mobile')).toHaveAttribute('data-media', 'none');
    await expect(g.page.getByText('Sin imagen de celular')).toBeVisible();
  } finally { await g.browser.close(); }
});

test('Portada preview: a video that cannot play falls back to its poster, and the preview reuses the landing media resolver', async () => {
  const f = await fixture({ site_settings: heroSeed('video', [site('home.hero.video', '/videos/does-not-exist.mp4'), site('home.hero.mobile_video', '')]) }); const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    const frame = page.locator('.admin-hero-preview__frame');
    await expect(frame.locator('video')).toHaveCount(0, { timeout: 20000 }); // errored: dropped
    await expect(frame).toHaveAttribute('data-media', 'image');
    await expect(frame.locator('img.admin-hero-preview__media')).toHaveAttribute('src', '/images/hero-papagayo-poster-v2.webp');
    await expect(frame.locator('.admin-hero-preview__title')).toBeVisible();
  } finally { await f.browser.close(); }
  const hero = await fs.readFile('src/components/home/Hero.tsx', 'utf8');
  const preview = await fs.readFile('src/components/admin/AdminHeroPreview.tsx', 'utf8');
  for (const source of [hero, preview]) assert.match(source, /resolveHeroMedia/, 'the landing and the preview share one media resolver');
  assert.doesNotMatch(hero, /function currentHeroAsset/, 'the resolver lives in utils/heroMedia.ts only');
});

// ---- Buttons ---------------------------------------------------------------------------------------------------------------

test('manual booking: the submit button says just "Crear" (no icon), is the primary fill and comes before Cancelar', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    await page.getByRole('button', { name: /Crear reserva/ }).first().click();
    const footer = page.locator('.admin-modal-footer');
    const buttons = footer.locator('button');
    assert.deepEqual(await buttons.evaluateAll((nodes) => nodes.map((node) => node.textContent.trim())), ['Crear', 'Cancelar']);
    await expect(buttons.first()).toHaveText('Crear');
    await expect(buttons.first().locator('svg')).toHaveCount(0);
    await expect(buttons.first()).toHaveAttribute('type', 'submit');
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await page.waitForTimeout(900); // .admin-btn animates its background for 160ms (slack for a loaded machine)
      const fill = await primaryFill(buttons.first());
      assert.equal(fill.bg, fill.primary, `${theme}: primary fill`);
      assert.notEqual(await buttons.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor), fill.bg, `${theme}: Cancelar is secondary`);
    }
  } finally { await f.browser.close(); }
});

test('Lugar de salida: Guardar is the primary fill (both themes) and comes before Cancelar', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: /Nuevo lugar/ }).click();
    const buttons = page.locator('.admin-modal-footer button');
    assert.deepEqual(await buttons.evaluateAll((nodes) => nodes.map((node) => node.textContent.trim())), ['Guardar', 'Cancelar']);
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await page.waitForTimeout(900); // .admin-btn animates its background for 160ms (slack for a loaded machine)
      const fill = await primaryFill(buttons.first());
      assert.equal(fill.bg, fill.primary, `${theme}: Guardar uses the primary fill`);
      assert.equal(fill.color, 'rgb(255, 255, 255)');
    }
  } finally { await f.browser.close(); }
});
