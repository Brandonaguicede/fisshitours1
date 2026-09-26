// Fourth manual-review round: GLOBAL standardization of the Admin. One media preview frame (Portada / Sobre Nosotros / Galería / Tours / Botes),
// the cropper's Zoom control and icon-only Upload, icon-only primary "+" to create, "Guardar" / "Visible" / "No visible" everywhere and no "Cerrar" buttons.
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


// ---- shared seeds -----------------------------------------------------------------------------------------------------------

const site = (key, value) => ({ key, value, type: key.includes('video') && !key.includes('poster') ? 'video' : key.includes('image') || key.includes('poster') ? 'image' : 'text', active: true });
const ABOUT_IMAGES = ['/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg', '/about/IMG_1020 (1).jpeg', '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg', '/galeria/IMG_9407.jpeg'];
const heroSeed = (mode) => [
  site('home.hero.title.en', 'Experience the Ocean'),
  site('home.hero.media_mode', mode),
  site('home.hero.image', '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg'),
  site('home.hero.mobile_image', '/about/IMG_1020 (1).jpeg'),
  site('home.hero.video', '/videos/hero-papagayo-desktop-v2.mp4'),
  site('home.hero.mobile_video', '/videos/hero-papagayo-mobile-v2.mp4'),
  site('home.hero.video_poster', '/images/hero-papagayo-poster-v2.webp'),
];
const aboutSeed = ABOUT_IMAGES.map((src, index) => site(`about.carousel_${index + 1}.image`, src));
const realGallery = [
  { id: 'g-1', title: 'Sunset', alt: 'Alt one', alt_en: 'Alt one', alt_es: 'Alt uno', category: 'fishing', image_url: '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg', src: '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg', image_public_id: 'gallery/g-1/a.webp', active: true, sort_order: 1 },
];
// A 1x1 PNG: enough for the crop dialog to open.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pickFile = (scope) => scope.locator('input[type="file"][aria-label="Elegir archivo de imagen"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
const textOf = (locator) => locator.evaluate((node) => node.textContent.trim());
const listSource = async (dir) => {
  const { readdir, readFile } = fs;
  const names = (await readdir(dir)).filter((name) => name.endsWith('.tsx'));
  return Promise.all(names.map(async (name) => [`${dir}/${name}`, await readFile(`${dir}/${name}`, 'utf8')]));
};
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/\{\/\*.*?\*\/\}/g, '')).join('\n');

// A. Portada copy ------------------------------------------------------------------------------------------------------------

test('Portada: the page description is the clean, natural copy', async () => {
  const f = await fixture({ site_settings: heroSeed('image') }); const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await expect(page.getByText('Configura el fondo y los textos principales de la portada.', { exact: true })).toBeVisible();
    await expect(page.getByText('Fondo (imágenes o video) y textos de la portada del inicio.')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

// B / (14, 15, 16). One preview frame for Portada, Sobre Nosotros and Galería ---------------------------------------------

const frameStyle = async (locator) => { await locator.page().waitForTimeout(500); return locator.evaluate((node) => {
  const style = getComputedStyle(node);
  const media = node.querySelector('img, video');
  const box = node.getBoundingClientRect();
  return {
    radius: style.borderTopLeftRadius, border: `${style.borderTopWidth} ${style.borderTopStyle}`, background: style.backgroundColor, aspect: style.aspectRatio, maxHeight: style.maxHeight, overflow: style.overflow,
    fit: media ? getComputedStyle(media).objectFit : 'none', height: Math.round(box.height), width: Math.round(box.width), mediaBox: media ? { w: Math.round(media.getBoundingClientRect().width), h: Math.round(media.getBoundingClientRect().height) } : null,
  };
  }); };

test('Hero (image + video), About and Galería editors use the very same preview frame: same box, ratio, border, background and contain fit', async () => {
  const f = await fixture({ site_settings: [...heroSeed('image'), ...aboutSeed], gallery_images: realGallery }); const { page } = f;
  try {
    const frames = {};
    // Gallery.
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Editar imagen Sunset' }).click();
    const galleryFrame = page.getByRole('dialog').locator('.admin-media-preview');
    await expect(galleryFrame).toHaveCount(1);
    await expect(galleryFrame.locator('img')).toBeVisible();
    frames.gallery = await frameStyle(galleryFrame);
    await page.keyboard.press('Escape');
    // About.
    await page.goto(`${base}/admin/sobre-nosotros`);
    await page.getByRole('button', { name: 'Editar Carrusel About - foto 1' }).click();
    const aboutFrame = page.getByRole('dialog').locator('.admin-media-preview');
    await expect(aboutFrame).toHaveCount(1);
    await expect(aboutFrame.locator('img')).toBeVisible();
    frames.about = await frameStyle(aboutFrame);
    await page.keyboard.press('Escape');
    // Hero image, then Hero video (same box, the player inside).
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: /^Editar Slide 1 - compu/ }).click();
    const heroFrame = page.getByRole('dialog').locator('.admin-media-preview');
    await expect(heroFrame).toHaveCount(1);
    await expect(heroFrame.locator('img')).toBeVisible();
    frames.hero = await frameStyle(heroFrame);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    await page.getByRole('button', { name: 'Editar Video de fondo', exact: true }).click();
    const videoFrame = page.getByRole('dialog').locator('.admin-media-preview');
    await expect(videoFrame).toHaveCount(1);
    await expect(videoFrame.locator('video')).toBeVisible();
    frames.video = await frameStyle(videoFrame);
    for (const [name, frame] of Object.entries(frames)) {
      assert.equal(frame.aspect, '16 / 9', name);
      assert.equal(frame.maxHeight, '208px', `${name}: compact frame (13rem)`);
      assert.ok(frame.height <= 208 && frame.height >= 150, `${name}: a compact frame, not half a screen (${frame.height}px)`);
      assert.equal(frame.overflow, 'hidden', name);
      assert.ok(frame.mediaBox.w <= frame.width && frame.mediaBox.h <= frame.height, `${name}: the media never leaves the frame`);
    }
    for (const name of ['about', 'hero', 'video']) {
      for (const key of ['radius', 'border', 'background', 'aspect', 'maxHeight', 'overflow', 'fit', 'height']) assert.equal(frames[name][key], frames.gallery[key], `${name} vs gallery: ${key}`);
    }
    assert.equal(frames.gallery.fit, 'contain');
  } finally { await f.browser.close(); }
});

test('the Hero / About asset editor closes with its X only (no "Listo") and keeps the controls below the frame; the frame is also compact on a phone', async () => {
  const f = await fixture({ site_settings: [...heroSeed('video'), ...aboutSeed] }, { width: 390, height: 900 }); const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Editar Video de fondo', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Listo' })).toHaveCount(0);
    await expect(dialog.locator('.admin-modal-footer')).toHaveCount(0);
    // Order: frame, then Cambiar (primary), then the R2 URL field.
    const order = await dialog.evaluate((root) => ['.admin-media-preview', '.admin-image-manager__actions', '.admin-video-manager__r2'].map((selector) => root.querySelector(selector).getBoundingClientRect().top));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    await expect(dialog.getByRole('button', { name: 'Cambiar', exact: true })).toBeVisible();
    const frame = await frameStyle(dialog.locator('.admin-media-preview'));
    assert.ok(frame.height <= 208, `phone frame ${frame.height}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto(`${base}/admin/sobre-nosotros`);
    await page.getByRole('button', { name: 'Editar Carrusel About - foto 1' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Listo' })).toHaveCount(0);
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cambiar', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

// C. Galería editor ------------------------------------------------------------------------------------------------------------

test('Galería editor: no Título field, a single delete (Estado y visibilidad), no "Cerrar" button, and the footer is just "Guardar"', async () => {
  const f = await fixture({ gallery_images: realGallery }); const { page } = f;
  try {
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Editar imagen Sunset' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Titulo', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(/^Título$|^Titulo$/)).toHaveCount(0);
    await expect(dialog.getByRole('combobox', { name: 'Categoria' })).toBeVisible();
    // One delete only, inside "Estado y visibilidad".
    await expect(dialog.getByRole('button', { name: /Eliminar/ })).toHaveCount(1);
    await expect(dialog.locator('.admin-tour-danger-row').getByRole('button', { name: 'Eliminar imagen' })).toBeVisible();
    await expect(dialog.locator('.admin-image-manager__delete')).toHaveCount(0);
    // The picker is "Cambiar" (primary), before nothing else in that row.
    const picker = dialog.locator('.admin-image-manager__actions .admin-image-manager__pick');
    await expect(picker).toHaveText('Cambiar');
    assert.doesNotMatch(await picker.getAttribute('class'), /secondary|ghost/);
    // Close: only the X. The footer holds "Guardar", no icon.
    await expect(dialog.locator('button').filter({ hasText: /^Cerrar$/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Cerrar', exact: true })).toHaveCount(1); // the X (aria-label)
    const footer = dialog.locator('.admin-modal-footer button');
    await expect(footer).toHaveCount(1);
    assert.equal(await textOf(footer.first()), 'Guardar');
    await expect(footer.first().locator('svg')).toHaveCount(0);
  } finally { await f.browser.close(); }
});

// E / 5 / 6. Cropper ---------------------------------------------------------------------------------------------------------

test('Ajustar imagen: "Zoom 100%" centered over the bar, "-" left and "+" right, no reset icon, icon-only Upload, no Cancelar', async () => {
  const f = await fixture({ gallery_images: realGallery }); const { page } = f;
  try {
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Editar imagen Sunset' }).click();
    await pickFile(page.getByRole('dialog'));
    const crop = page.getByRole('dialog').filter({ hasText: 'Ajustar imagen' });
    await expect(crop.getByRole('heading', { name: 'Ajustar imagen' })).toBeVisible();
    const value = crop.locator('.admin-image-crop__zoom-value');
    await expect(value).toHaveText('Zoom 100%');
    const range = crop.getByRole('slider', { name: 'Zoom del recorte' });
    const minus = crop.getByRole('button', { name: 'Alejar' });
    const plus = crop.getByRole('button', { name: 'Acercar' });
    const [v, r, m, p] = await Promise.all([value, range, minus, plus].map((locator) => locator.boundingBox()));
    assert.ok(v.y + v.height <= r.y + 2, 'label + percentage sit above the bar');
    assert.ok(Math.abs((v.x + v.width / 2) - (r.x + r.width / 2)) <= 4, 'the label is centered over the bar');
    assert.ok(m.x + m.width <= r.x + 1 && r.x + r.width <= p.x + 1, '"-" is left of the bar and "+" is right of it');
    assert.ok(Math.abs((m.y + m.height / 2) - (r.y + r.height / 2)) <= 6 && Math.abs((p.y + p.height / 2) - (r.y + r.height / 2)) <= 6, 'one row');
    // No reset / back arrow anywhere near the bar.
    await expect(crop.locator('svg.lucide-rotate-ccw, svg.lucide-undo, svg.lucide-undo-2, svg.lucide-rotate-cw')).toHaveCount(0);
    await expect(crop.getByRole('button', { name: /restablecer|reiniciar|reset/i })).toHaveCount(0);
    // +/- change the zoom (10% steps, inside 100-300%), and so does the keyboard on the slider.
    await expect(minus).toBeDisabled();
    await plus.click();
    await expect(value).toHaveText('Zoom 110%');
    await plus.click();
    await expect(value).toHaveText('Zoom 120%');
    await minus.click();
    await expect(value).toHaveText('Zoom 110%');
    await range.focus();
    await page.keyboard.press('ArrowRight');
    await expect(value).toHaveText('Zoom 115%');
    await expect(range).toHaveValue('1.15');
    await page.keyboard.press('End');
    await expect(value).toHaveText('Zoom 300%');
    await expect(plus).toBeDisabled();
    // Footer: only the icon-only Upload (primary). No Cancelar, no "Continuar y subir"; the X closes.
    const footer = crop.locator('.admin-modal-footer button');
    await expect(footer).toHaveCount(1);
    assert.equal(await textOf(footer.first()), '');
    await expect(footer.first()).toHaveAttribute('aria-label', 'Subir imagen');
    await expect(footer.first()).toHaveAttribute('title', 'Subir imagen');
    await expect(footer.first().locator('svg')).toHaveCount(1);
    assert.doesNotMatch(await footer.first().getAttribute('class'), /secondary|ghost/);
    await expect(crop.getByRole('button', { name: /Cancelar|Continuar y subir/ })).toHaveCount(0);
    await crop.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ajustar imagen' })).toHaveCount(0);
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Editar imagen' })).toBeVisible(); // the gallery editor stays open
  } finally { await f.browser.close(); }
});

test('Ajustar imagen: the crop still produces the upload (WebP) with the zoomed area, through the icon-only Upload button', async () => {
  const f = await fixture({ gallery_images: realGallery }); const { page } = f;
  const uploads = [];
  try {
    await page.route('**/functions/v1/storage-upload-image', async (route) => {
      uploads.push({ type: route.request().headers()['content-type'] ?? '' });
      return route.fulfill({ json: { storage_path: 'gallery/g-1/new.webp', public_url: 'https://cdn.example.test/gallery/g-1/new.webp', width: 1, height: 1, size_bytes: 10 } });
    });
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Editar imagen Sunset' }).click();
    await pickFile(page.getByRole('dialog'));
    const crop = page.getByRole('dialog').filter({ hasText: 'Ajustar imagen' });
    await crop.getByRole('button', { name: 'Acercar' }).click();
    const upload = crop.getByRole('button', { name: 'Subir imagen', exact: true });
    await expect(upload).toBeEnabled({ timeout: 15000 });
    await upload.click();
    await expect.poll(() => uploads.length).toBe(1);
    assert.match(uploads[0].type, /multipart\/form-data/);
    await expect(page.getByRole('heading', { name: 'Ajustar imagen' })).toHaveCount(0);
  } finally { await f.browser.close(); }
});

// F. Crear (icon-only primary) ----------------------------------------------------------------------------------------------

test('Crear: the main listings use the primary icon-only "+" (aria-label + title, hit target, focus ring) — gallery and departure places at runtime', async () => {
  const f = await fixture(); const { page } = f;
  try {
    for (const [route, label] of [['/admin/gallery', 'Nueva imagen'], ['/admin/departure-locations', 'Nuevo lugar']]) {
      await page.goto(`${base}${route}`);
      const create = page.getByRole('button', { name: label, exact: true });
      await expect(create).toBeVisible();
      assert.equal(await textOf(create), '', `${route}: no visible text`);
      await expect(create).toHaveAttribute('title', label);
      await expect(create.locator('svg.lucide-plus')).toHaveCount(1);
      const shape = await create.evaluate((node) => { const box = node.getBoundingClientRect(); const style = getComputedStyle(node); return { w: box.width, h: box.height, className: node.className, bg: style.backgroundColor }; });
      assert.ok(shape.w >= 40 && shape.h >= 40, `${route}: hit target ${shape.w}x${shape.h}`);
      assert.doesNotMatch(shape.className, /secondary|ghost/);
      // Primary hierarchy: filled with the Admin primary (same fill as every primary button), not transparent.
      assert.notEqual(shape.bg, 'rgba(0, 0, 0, 0)');
      // Second control of the toolbar (after the search), as before.
      assert.equal(await page.evaluate(() => [...document.querySelector('.admin-toolbar').querySelectorAll('input, button')].slice(0, 2).map((el) => (el.matches('input') ? 'search' : el.getAttribute('aria-label'))).join('|')), `search|${label}`);
      await create.focus();
      await page.keyboard.press('Tab');
      await create.focus();
      const ring = await create.evaluate((node) => { const style = getComputedStyle(node); return `${style.outlineStyle}|${style.outlineWidth}|${style.boxShadow}`; });
      assert.notEqual(ring, 'none|0px|none', 'a visible focus indicator');
    }
  } finally { await f.browser.close(); }
});

test('source: every main listing (Tours, Botes, Reservas, Galería, Lugares) creates through AdminCreateButton — no "+ Texto" primary buttons', async () => {
  const pages = await listSource('src/pages/admin');
  const expected = { 'AdminToursPage.tsx': 'Crear tour', 'AdminBoatsPage.tsx': 'Crear bote', 'AdminReservationsPage.tsx': 'Crear reserva', 'AdminGalleryPage.tsx': 'Nueva imagen', 'AdminDepartureLocationsPage.tsx': 'Nuevo lugar' };
  for (const [name, label] of Object.entries(expected)) {
    const source = pages.find(([path]) => path.endsWith(name))[1];
    assert.match(source, new RegExp(`primaryAction=\\{<AdminCreateButton label="${label}"`), `${name} uses AdminCreateButton`);
    assert.doesNotMatch(source, /primaryAction=\{<button/, `${name}: no text button as the primary action`);
  }
});

// G. Guardar ----------------------------------------------------------------------------------------------------------------

test('Guardar: the visible text is exactly "Guardar", without icon — gallery, departure, Portada, Sobre Nosotros and the reorder mode', async () => {
  const f = await fixture({ site_settings: [...heroSeed('image'), ...aboutSeed], gallery_images: realGallery }); const { page } = f;
  try {
    const check = async (locator, name) => {
      assert.equal(await textOf(locator), 'Guardar', name);
      await expect(locator.locator('svg'), `${name}: no icon`).toHaveCount(0);
    };
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Editar imagen Sunset' }).click();
    await check(page.getByRole('dialog').locator('.admin-modal-footer button').first(), 'gallery editor');
    await page.keyboard.press('Escape');
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: 'Nuevo lugar', exact: true }).click();
    await check(page.getByRole('dialog').locator('.admin-modal-footer button').first(), 'departure modal');
    await expect(page.getByRole('dialog').locator('.admin-modal-footer button').nth(1)).toHaveText('Cancelar');
    await page.keyboard.press('Escape');
    for (const route of ['/admin/portada', '/admin/sobre-nosotros']) {
      await page.goto(`${base}${route}`);
      await check(page.getByRole('button', { name: 'Guardar', exact: true }), route);
      await expect(page.getByRole('button', { name: /Guardar (cambios|portada|Sobre)/ })).toHaveCount(0);
    }
    // Reorder mode: "Guardar" (assistive tech still hears "Guardar orden"), then Cancelar.
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: 'Reordenar' }).click();
    const save = page.getByRole('button', { name: 'Guardar orden', exact: true });
    await check(save, 'reorder');
    await expect(save).toHaveAttribute('aria-label', 'Guardar orden');
  } finally { await f.browser.close(); }
});

test('source audit: no "Guardar cambios / portada / Sobre Nosotros / paquete / orden" text and no Save icon in the Admin (Guardar borrador is the one documented exception)', async () => {
  const files = [...await listSource('src/pages/admin'), ...await listSource('src/components/admin')];
  for (const [path, raw] of files) {
    const source = stripComments(raw);
    assert.doesNotMatch(source, />\s*Guardar (cambios|portada|Sobre Nosotros|paquete|orden)\b/, `${path}: visible text`);
    assert.doesNotMatch(source, /'Guardar (cambios|portada|Sobre Nosotros|paquete)'/, `${path}: label string`);
    assert.doesNotMatch(source, /import \{[^}]*\bSave\b[^}]*\} from 'lucide-react'/, `${path}: no Save icon`);
    assert.doesNotMatch(source, /<Save\b/, `${path}: no Save icon`);
    // "Guardar borrador" only exists in the Tours / Botes wizards, where a "Guardar" (publish) sits beside it.
    if (/Guardar borrador/.test(source)) assert.match(path, /AdminToursPage|AdminBoatsPage/, `${path}: Guardar borrador is a wizard-only exception`);
  }
});

// H. Visibility ------------------------------------------------------------------------------------------------------------

test('Visibilidad: the control only says "Visible" / "No visible" with Eye / EyeOff (current state); the accessible name keeps the action', async () => {
  const f = await fixture({ gallery_images: realGallery }); const { page } = f;
  try {
    const state = async (button) => ({ text: (await button.innerText()).trim(), eye: await button.locator('svg.lucide-eye').count(), eyeOff: await button.locator('svg.lucide-eye-off').count() });
    // Gallery editor.
    await page.goto(`${base}/admin/gallery`);
    await page.getByRole('button', { name: 'Editar imagen Sunset' }).click();
    const galleryToggle = page.getByRole('dialog').locator('.admin-visibility-btn');
    assert.deepEqual(await state(galleryToggle), { text: 'Visible', eye: 1, eyeOff: 0 });
    await expect(galleryToggle).toHaveAccessibleName('Visible. Ocultar imagen');
    await galleryToggle.click();
    assert.deepEqual(await state(galleryToggle), { text: 'No visible', eye: 0, eyeOff: 1 });
    await expect(galleryToggle).toHaveAccessibleName('No visible. Mostrar imagen');
    await page.keyboard.press('Escape');
    // Departure places: d-2 starts inactive.
    await page.goto(`${base}/admin/departure-locations`);
    await page.getByRole('button', { name: /Editar lugar de salida Hermosa/ }).click();
    const departureToggle = page.getByRole('dialog').locator('.admin-visibility-btn');
    assert.deepEqual(await state(departureToggle), { text: 'No visible', eye: 0, eyeOff: 1 });
    await departureToggle.click();
    assert.deepEqual(await state(departureToggle), { text: 'Visible', eye: 1, eyeOff: 0 });
    await page.keyboard.press('Escape');
    // Comments.
    await page.goto(`${base}/admin/reviews`);
    await page.getByRole('button', { name: 'Editar comentario de Ben' }).click();
    assert.deepEqual(await state(page.getByRole('dialog').locator('.admin-visibility-btn')), { text: 'No visible', eye: 0, eyeOff: 1 });
    // Never the old action wording as visible text, anywhere in the editors.
    assert.doesNotMatch(await page.getByRole('dialog').innerText(), /Ocultar imagen|Mostrar imagen|Ocultar comentario|Mostrar comentario|Activar lugar|Desactivar lugar|Hacer visible/);
  } finally { await f.browser.close(); }
});

test('source audit: visibility buttons only come from AdminVisibilityButton (no "Ocultar/Mostrar/Activar/Desactivar … " visible text on toggles)', async () => {
  const files = [...await listSource('src/pages/admin'), ...await listSource('src/components/admin')];
  for (const [path, raw] of files) {
    const source = stripComments(raw);
    if (/AdminPrimitives\.tsx$|AdminLoginPage\.tsx$|AdminPaymentMethodsPage\.tsx$/.test(path)) continue; // the primitive itself, the password eye, and the icon-only payment row toggle
    assert.doesNotMatch(source, /import \{[^}]*\bEyeOff?\b[^}]*\} from 'lucide-react'/, `${path}: Eye / EyeOff are rendered by AdminVisibilityButton only`);
    assert.doesNotMatch(source, />\s*\{[^}]*\? '(Ocultar|Mostrar|Activar|Desactivar) [^']*' : '(Ocultar|Mostrar|Activar|Desactivar)/, `${path}: action wording as visible text`);
  }
});

// I. No "Cerrar" text buttons -------------------------------------------------------------------------------------------------

test('no button anywhere in the Admin shows the text "Cerrar" (the X is icon-only, named by aria-label)', async () => {
  const f = await fixture({ site_settings: [...heroSeed('image'), ...aboutSeed], gallery_images: realGallery }); const { page } = f;
  try {
    const visibleCerrar = () => page.evaluate(() => [...document.querySelectorAll('button, [role="button"], a')].filter((node) => node.textContent.trim() === 'Cerrar' && node.getClientRects().length > 0).length);
    for (const route of ['/admin', '/admin/reservations', '/admin/tours', '/admin/boats', '/admin/boat-tours', '/admin/departure-locations', '/admin/payment-methods', '/admin/portada', '/admin/sobre-nosotros', '/admin/gallery', '/admin/reviews']) {
      await page.goto(`${base}${route}`);
      await page.waitForTimeout(400);
      assert.equal(await visibleCerrar(), 0, route);
    }
    const editors = [
      ['/admin/gallery', () => page.getByRole('button', { name: 'Editar imagen Sunset' }).click()],
      ['/admin/reviews', () => page.getByRole('button', { name: 'Editar comentario de Ana' }).click()],
      ['/admin/departure-locations', () => page.getByRole('button', { name: /Editar lugar de salida Hermosa/ }).click()],
      ['/admin/sobre-nosotros', () => page.getByRole('button', { name: 'Editar Carrusel About - foto 1' }).click()],
      ['/admin/portada', () => page.getByRole('button', { name: /^Editar Slide 1 - compu/ }).click()],
    ];
    for (const [route, open] of editors) {
      await page.goto(`${base}${route}`);
      await open();
      await page.waitForTimeout(300);
      assert.equal(await visibleCerrar(), 0, `${route} editor`);
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).first()).toBeVisible(); // the X is there
      await page.keyboard.press('Escape');
    }
  } finally { await f.browser.close(); }
});

test('source audit: no JSX button text "Cerrar" / "Listo" that only closes an editor', async () => {
  const files = [...await listSource('src/pages/admin'), ...await listSource('src/components/admin')];
  for (const [path, raw] of files) {
    const source = stripComments(raw);
    assert.doesNotMatch(source, />\s*Cerrar\s*</, `${path}: Cerrar as button text`);
    if (!/AdminPrimitives\.tsx$/.test(path)) assert.doesNotMatch(source, />\s*Listo\s*</, `${path}: Listo as button text`); // the filters popover keeps its own "Listo"
  }
});


// ---- Ronda 4b: avatares, tarjetas de media unificadas y vista previa compacta del Hero ------------------------------------------

const longNameReviews = [
  { id: 'r-1', name: 'Ana', country: 'CR', quote: 'Great', quote_es: 'x', quote_en: 'Great', translated: true, rating: 5, status: 'approved', featured: false, active: true, sort_order: 1, image_url: null },
  { id: 'r-2', name: 'Maximiliano Alejandro de la Cruz y Fernandez del Castillo', country: 'CR', quote: 'Long name', quote_es: 'x', quote_en: 'Long name', translated: true, rating: 5, status: 'pending', featured: false, active: false, sort_order: 2, image_url: null },
  { id: 'r-3', name: 'zoe', country: 'CR', quote: 'Lower', quote_es: 'x', quote_en: 'Lower', translated: true, rating: 4, status: 'approved', featured: false, active: true, sort_order: 3, image_url: null },
];

test('Avatares: every initial is a perfect, non-deformed circle with the letter centered — short names, a name that wraps to several lines, phone and dark', async () => {
  const f = await fixture({ reviews: longNameReviews }); const { page } = f;
  try {
    const measure = () => page.locator('.admin-avatar').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const range = document.createRange();
      range.selectNodeContents(node);
      const text = range.getBoundingClientRect();
      const row = node.closest('td').getBoundingClientRect();
      return {
        w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10, radius: style.borderTopLeftRadius,
        dx: Math.abs((text.left + text.width / 2) - (box.left + box.width / 2)), dy: Math.abs((text.top + text.height / 2) - (box.top + box.height / 2)),
        midOffset: Math.abs((box.top + box.height / 2) - (row.top + row.height / 2)), letter: node.textContent.trim(),
      };
    }));
    for (const [theme, viewport] of [['light', { width: 1366, height: 1000 }], ['dark', { width: 1366, height: 1000 }], ['light', { width: 390, height: 900 }]]) {
      await page.setViewportSize(viewport);
      await page.goto(`${base}/admin/reviews`);
      await setTheme(page, theme);
      await expect(page.locator('.admin-avatar')).toHaveCount(3);
      await page.waitForTimeout(400);
      const avatars = await measure();
      assert.deepEqual(avatars.map((a) => a.letter), ['A', 'M', 'Z']);
      for (const a of avatars) {
        const tag = `${theme}/${viewport.width}: ${JSON.stringify(a)}`;
        assert.equal(a.w, 40, tag);
        assert.equal(a.h, 40, tag); // never squeezed or stretched by a long name / a taller row
        assert.ok(['50%', '20px'].includes(a.radius), tag); // half of the side: a circle
        assert.ok(a.dx <= 1.5 && a.dy <= 2.5, `${tag}: letter centered`);
        assert.ok(a.midOffset <= 2, `${tag}: vertically centered in its row`);
      }
    }
    // Same avatar in the editor summary.
    await page.setViewportSize({ width: 1366, height: 1000 });
    await page.goto(`${base}/admin/reviews`);
    await page.getByRole('button', { name: /^Editar comentario de Maximiliano/ }).click();
    await page.waitForTimeout(600);
    const inEditor = await page.getByRole('dialog').locator('.admin-avatar').evaluate((node) => { const box = node.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height), getComputedStyle(node).borderTopLeftRadius]; });
    assert.deepEqual(inEditor.slice(0, 2), [40, 40]);
    assert.ok(['50%', '20px'].includes(inEditor[2]));
  } finally { await f.browser.close(); }
});

test('Tarjetas de media: Portada, Sobre Nosotros and Galería render the same card (size, 4:3 preview, cover, radius, background, preview / título / estado / editar)', async () => {
  const f = await fixture({ site_settings: [...heroSeed('image'), ...aboutSeed], gallery_images: [...realGallery, { ...realGallery[0], id: 'g-2', category: 'boats', sort_order: 2 }] }); const { page } = f;
  try {
    const cardInfo = async (route, prepare) => {
      await page.goto(`${base}${route}`);
      if (prepare) await prepare();
      const card = page.locator('.admin-media-grid .admin-media-card').first();
      await expect(card.locator('img')).toBeVisible();
      await page.waitForTimeout(400);
      return card.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const media = node.querySelector('img, video');
        const mediaBox = media.getBoundingClientRect();
        const mediaStyle = getComputedStyle(media);
        const body = node.querySelector('.admin-media-card__body');
        const order = [media, node.querySelector('strong'), node.querySelector('.admin-actions')].map((el) => Math.round(el.getBoundingClientRect().top));
        const grid = node.parentElement;
        return {
          radius: style.borderTopLeftRadius, background: style.backgroundColor, shadow: style.boxShadow, overflow: style.overflow,
          fit: mediaStyle.objectFit, aspect: mediaStyle.aspectRatio, ratio: Math.round((mediaBox.width / mediaBox.height) * 100) / 100, mediaW: Math.round(mediaBox.width), mediaH: Math.round(mediaBox.height),
          cardW: Math.round(box.width), bodyPadding: getComputedStyle(body).padding, gridColumns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, gridGap: getComputedStyle(grid).gap,
          stacked: order.every((top, index) => index === 0 || top >= order[index - 1]), badgeBeforeEdit: node.querySelector('.admin-badge').getBoundingClientRect().left < node.querySelector('.admin-icon-action').getBoundingClientRect().left,
        };
      });
    };
    const gallery = await cardInfo('/admin/gallery');
    const about = await cardInfo('/admin/sobre-nosotros');
    const hero = await cardInfo('/admin/portada');
    assert.equal(gallery.fit, 'cover');
    assert.equal(gallery.aspect, '4 / 3');
    for (const [name, card] of [['about', about], ['hero', hero]]) {
      assert.deepEqual(card, gallery, `${name} card == gallery card`);
    }
    assert.ok(gallery.stacked && gallery.badgeBeforeEdit, 'preview, título, estado, editar');
    // A video card follows the same box.
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    const videoCard = page.locator('.admin-media-grid .admin-media-card').first();
    await expect(videoCard.locator('video')).toHaveCount(1);
    const video = await videoCard.evaluate((node) => { const media = node.querySelector('video'); const box = media.getBoundingClientRect(); return [getComputedStyle(media).objectFit, getComputedStyle(media).aspectRatio, Math.round(box.width), Math.round(box.height), Math.round(node.getBoundingClientRect().width)]; });
    assert.deepEqual(video.slice(0, 2), ['cover', '4 / 3']);
    assert.equal(video[2], gallery.mediaW);
    assert.equal(video[3], gallery.mediaH);
    assert.equal(video[4], gallery.cardW);
    // Phone: single shared behaviour, no overflow.
    for (const route of ['/admin/gallery', '/admin/sobre-nosotros', '/admin/portada']) {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(`${base}${route}`);
      await expect(page.locator('.admin-media-grid .admin-media-card').first()).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, route);
    }
  } finally { await f.browser.close(); }
});

test('Portada · Vista previa: the container hugs the preview (compact), the Computadora / Celular selector and the media label are still there', async () => {
  const f = await fixture({ site_settings: heroSeed('image') }); const { page } = f;
  try {
    await page.goto(`${base}/admin/portada`);
    await page.getByRole('button', { name: 'Textos', exact: true }).click();
    const container = page.locator('.admin-content-preview');
    const frame = page.locator('.admin-hero-preview__frame');
    await expect(frame).toBeVisible();
    await page.waitForTimeout(500);
    const measure = () => page.evaluate(() => {
      const box = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      return { container: box('.admin-content-preview'), frame: box('.admin-hero-preview__frame'), bar: box('.admin-hero-preview__bar'), card: box('.admin-content-section') };
    });
    let m = await measure();
    // Little dead space around the frame: horizontally the container is the widest of (bar, frame) plus its padding; vertically it is label + bar + frame.
    assert.ok(m.container.w <= Math.max(m.frame.w, m.bar.w) + 40, `container ${m.container.w}px vs frame ${m.frame.w}px`);
    assert.ok(m.container.w < m.card.w * 0.6, 'not a full-width block');
    assert.ok(m.container.h <= m.frame.h + m.bar.h + 90, `container height ${m.container.h}px vs frame ${m.frame.h}px`);
    assert.ok(Math.abs((m.frame.l + m.frame.r) / 2 - (m.container.l + m.container.r) / 2) <= 2, 'the frame is centered in its container');
    await expect(page.getByRole('group', { name: 'Contexto de la vista previa' })).toBeVisible();
    await expect(page.locator('.admin-hero-preview__source')).toContainText('Imagen de fondo · computadora');
    // The selector still works and the container stays compact in both contexts.
    await page.getByRole('button', { name: 'Celular', exact: true }).click();
    await expect(page.locator('.admin-hero-preview__frame--mobile')).toBeVisible();
    await expect(page.locator('.admin-hero-preview__source')).toContainText('celular');
    await page.waitForTimeout(300);
    m = await measure();
    assert.ok(m.container.w < m.card.w * 0.6 && m.container.h <= m.frame.h + m.bar.h + 90, `mobile: container ${m.container.w}x${m.container.h}`);
    await page.getByRole('button', { name: 'Computadora', exact: true }).click();
    await expect(page.locator('.admin-hero-preview__frame--desktop')).toBeVisible();
    // The media itself is not touched: same real image, same overlay + texts.
    await expect(page.locator('.admin-hero-preview__media')).toHaveAttribute('src', '/about/8809f2f5-0a3b-45bd-9771-1ac3505181bc.jpeg');
    await expect(page.locator('.admin-hero-preview__overlay')).toHaveCount(1);
    await expect(page.locator('.admin-hero-preview__title')).toContainText('Experience');
    // Phone viewport: no overflow.
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await expect(container).toBeVisible();
  } finally { await f.browser.close(); }
});
