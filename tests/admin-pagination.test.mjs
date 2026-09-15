import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://127.0.0.1:5180';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const initialBookings = Array.from({ length: 76 }, (_, i) => ({
  id: `booking-${i}`, booking_reference: `PFT-${String(i + 1).padStart(3, '0')}`, boat_id: 'boat-1', tour_id: 'tour-1', tour_package_id: 'package-1', time_slot_id: 'time-1',
  tour_date: i < 50 ? '2026-09-16' : '2026-09-17', created_at: '2026-09-15T08:00:00Z', guests: 2, total_snapshot: 350,
  departure_location_name_snapshot: 'Lugar de salida con una descripción extensa', departure_surcharge_snapshot: 0,
  payment_method_key: i % 3 ? 'whatsapp-link' : 'paypal', payment_status: i % 3 ? 'pending' : 'paid', booking_status: i % 3 ? 'pending_payment' : 'confirmed',
  customers: { full_name: `Cliente ${i + 1}`, email: 'cliente.con.un.correo.extremadamente.largo@example.com', whatsapp: '0000000' },
  boats: { name: 'Second Wind' }, tours: { title: 'Tour de pesca y snorkeling con una descripción extensa' }, time_slots: { label: '7:00 AM' }, special_requests: '',
}));

async function fixture(viewport = { width: 1440, height: 1000 }) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport });
  const bookings = structuredClone(initialBookings);
  const requests = [];
  const writes = [];
  let fail = false;
  let slow = false;
  const reviewRows = Array.from({ length: 76 }, (_, i) => ({ id: `review-${i}`, name: `Review ${i + 1}`, country: 'Costa Rica', quote: 'Una experiencia excelente', rating: 5, status: i % 2 ? 'approved' : 'pending', active: true, featured: false }));
  const galleryRows = Array.from({ length: 76 }, (_, i) => ({ id: `image-${i}`, alt: `Imagen ${i + 1}`, title: `Foto ${i + 1}`, category: i < 10 ? 'fishing' : 'custom', active: true, sort_order: i }));
  const packages = Array.from({ length: 76 }, (_, i) => ({ id: `package-${i}`, name: `Paquete ${i + 1}`, base_price: 350, included_guests: 2, max_guests: 6, active: true, boat_tours: { boat_id: i % 2 ? 'boat-2' : 'boat-1', boats: { name: i % 2 ? 'Boat Two' : 'Second Wind' }, tours: { title: 'Fishing Tour' } } }));
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'test-admin-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('/rpc/list_admin_bookings')) {
      const input = request.postDataJSON(); requests.push(input);
      if (slow) await new Promise((resolve) => setTimeout(resolve, 500));
      if (fail) return route.fulfill({ status: 500, json: { message: 'Simulated pagination failure' } });
      const rows = bookings.filter((row) => (input.p_booking_status === 'all' || row.booking_status === input.p_booking_status)
        && (input.p_payment_status === 'all' || row.payment_status === input.p_payment_status)
        && (!input.p_tour_date || row.tour_date === input.p_tour_date)
        && (!input.p_search || [row.booking_reference, row.customers.full_name, row.customers.email, row.customers.whatsapp, row.boats.name, row.tours.title].join(' ').toLowerCase().includes(input.p_search.toLowerCase())));
      return route.fulfill({ json: { rows: rows.slice(input.p_offset, input.p_offset + input.p_limit), total: rows.length } });
    }
    if (path.endsWith('/admin-confirm-booking')) {
      const input = request.postDataJSON(); writes.push({ name: 'confirm', ...input });
      const booking = bookings.find((row) => row.id === input.bookingId); booking.booking_status = 'confirmed'; booking.payment_status = 'paid';
      return route.fulfill({ json: { booking_id: booking.id, booking_status: 'confirmed', payment_status: 'paid', customerEmailPresent: true, emailQueued: true } });
    }
    if (path.endsWith('/rpc/update_booking_status')) {
      const input = request.postDataJSON(); writes.push({ name: 'cancel', ...input });
      const booking = bookings.find((row) => row.id === input.p_booking_id); booking.booking_status = input.p_booking_status; booking.payment_status = input.p_payment_status;
      return route.fulfill({ json: {} });
    }
    if (path.endsWith('/rpc/list_admin_gallery_categories')) return route.fulfill({ json: ['fishing', 'custom'] });
    if (path.endsWith('/bookings')) return route.fulfill({ json: bookings });
    if (path.endsWith('/boats')) return route.fulfill({ json: [{ id: 'boat-1', name: 'Second Wind' }, { id: 'boat-2', name: 'Boat Two' }] });
    let rows = path.endsWith('/reviews') ? reviewRows : path.endsWith('/gallery_images') ? galleryRows : path.endsWith('/tour_packages') ? packages : null;
    if (rows) {
      if (url.searchParams.has('status')) rows = rows.filter((row) => `eq.${row.status}` === url.searchParams.get('status'));
      if (url.searchParams.has('category')) rows = rows.filter((row) => `eq.${row.category}` === url.searchParams.get('category'));
      if (url.searchParams.has('boat_tours.boat_id')) rows = rows.filter((row) => `eq.${row.boat_tours.boat_id}` === url.searchParams.get('boat_tours.boat_id'));
      const start = Number(url.searchParams.get('offset') ?? 0); const size = Number(url.searchParams.get('limit') ?? rows.length);
      requests.push({ table: path.split('/').at(-1), start, size, filter: url.searchParams.get('status') ?? url.searchParams.get('category') ?? url.searchParams.get('boat_tours.boat_id'), select: url.searchParams.get('select') });
      return route.fulfill({ json: rows.slice(start, start + size), headers: { 'access-control-expose-headers': 'content-range', 'content-range': `${start}-${Math.max(start, start + Math.min(size, rows.length - start) - 1)}/${rows.length}` } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}/admin/login`);
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await expect(page.getByText('Reservas totales')).toBeVisible();
  return { browser, page, requests, writes, bookings, setFail: (value) => { fail = value; }, setSlow: (value) => { slow = value; } };
}

test('reservations paginate on the server, preserve filters, export all matches and retain actions', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    const nav = page.getByRole('navigation', { name: 'Paginación de reservas' });
    await expect(nav).toContainText('Mostrando 1–10 de 76 reservas');
    await expect(page.locator('.admin-reservations-table tbody tr')).toHaveCount(10);
    await expect(nav.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await nav.getByRole('button', { name: 'Siguiente' }).click();
    await expect(nav).toContainText('Mostrando 11–20 de 76 reservas');
    assert.equal(f.requests.filter((r) => r.p_offset !== undefined).at(-1).p_offset, 10);
    await nav.getByLabel('Registros por página').selectOption('25');
    await expect(nav).toContainText('Mostrando 1–25 de 76 reservas');
    await nav.getByLabel('Registros por página').selectOption('50');
    await expect(nav).toContainText('Mostrando 1–50 de 76 reservas');
    await nav.getByRole('button', { name: 'Siguiente' }).click();
    await expect(nav).toContainText('Mostrando 51–76 de 76 reservas');
    await expect(nav.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await page.getByLabel('Buscar reservas').fill('Second Wind');
    await expect(nav).toContainText('Mostrando 1–50 de 76 reservas');
    await nav.getByLabel('Registros por página').selectOption('10');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    const download = await downloadPromise;
    const csv = await fs.readFile(await download.path(), 'utf8');
    assert.equal(csv.trim().split('\r\n').length, 77);
    await page.getByRole('button', { name: /^Filtros/ }).click();
    await page.getByLabel('Estado de reserva', { exact: true }).selectOption('pending_payment');
    await page.getByRole('button', { name: 'Listo', exact: true }).click();
    await expect(nav).toContainText('de 50 reservas');
    await nav.getByRole('button', { name: 'Siguiente' }).click();
    await expect(nav).toContainText('Mostrando 11–20 de 50 reservas');
    const request = f.requests.filter((r) => r.p_offset !== undefined).at(-1);
    assert.equal(request.p_booking_status, 'pending_payment'); assert.equal(request.p_search, 'Second Wind');
    await page.getByLabel('Buscar reservas').fill('PFT-002');
    await expect(nav).toContainText('Mostrando 1–1 de 1 reservas');
    await page.locator('.admin-reservations-table').getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Editar reserva' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.locator('.admin-reservations-table').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(nav).toContainText('Mostrando 0–0 de 0 reservas');
    assert.equal(f.writes[0].bookingId, 'booking-1');
    await page.getByLabel('Buscar reservas').fill('no existen resultados');
    await expect(page.locator('.admin-reservations-table')).toContainText('No hay reservas para este filtro.');
  } finally { await f.browser.close(); }
});

test('responsive reservations contain scroll, preserve the sidebar and use cards on mobile', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    await expect(page.getByRole('navigation', { name: 'Paginación de reservas' })).toContainText('de 76 reservas');
    await fs.mkdir('tmp/admin-responsive', { recursive: true });
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const metrics = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, sidebar: document.querySelector('.admin-sidebar').getBoundingClientRect().width, wrap: document.querySelector('.admin-table-wrap').getBoundingClientRect().width, main: document.querySelector('.admin-main').getBoundingClientRect().width }));
      assert.ok(metrics.document <= metrics.viewport, JSON.stringify(metrics));
      if (width >= 768) {
        await expect(page.locator('.admin-reservations-table')).toBeVisible();
        assert.ok(metrics.wrap <= metrics.main);
        if (width > 960) assert.equal(metrics.sidebar, 264);
      } else {
        await expect(page.locator('.admin-reservations-table')).toBeHidden();
        await expect(page.locator('.admin-reservation-cards article')).toHaveCount(10);
        await expect(page.locator('.admin-reservation-cards article').first()).toContainText('7:00 AM');
      }
      await page.screenshot({ path: `tmp/admin-responsive/reservations-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Colapsar menu', exact: true }).click();
    await page.locator('.admin-reservation-card').nth(1).getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.locator('.admin-reservation-card').nth(1)).toContainText('cancelled');
    assert.equal(f.writes[0].p_booking_id, 'booking-1');
  } finally { await f.browser.close(); }
});

test('loading retains table structure, failures are explicit and retry recovers', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.goto(`${base}/admin/reservations`);
    const nav = page.getByRole('navigation', { name: 'Paginación de reservas' });
    await expect(nav).toContainText('de 76 reservas');
    f.setSlow(true);
    await nav.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('status')).toContainText('Cargando reservas');
    await expect(page.locator('.admin-reservations-table thead')).toBeVisible();
    await expect(page.locator('.admin-reservations-table tbody tr')).toHaveCount(10);
    await expect(nav).toContainText('Mostrando 11–20 de 76 reservas');
    await expect(nav).toHaveAttribute('aria-busy', 'false');
    f.setFail(true);
    await nav.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('alert')).toContainText('Simulated pagination failure');
    f.setFail(false);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(nav).toContainText('Mostrando 21–30 de 76 reservas');
  } finally { await f.browser.close(); }
});

test('filter round trips reset the page and confirming the last match returns to a valid page', async () => {
  const f = await fixture(); const { page } = f;
  f.bookings.splice(17);
  try {
    await page.goto(`${base}/admin/reservations`);
    const nav = page.getByRole('navigation', { name: 'Paginación de reservas' });
    await expect(nav).toContainText('de 17 reservas');
    await nav.getByRole('button', { name: 'Siguiente' }).click();
    await expect(nav).toHaveAttribute('aria-busy', 'false');
    for (const [filter, total] of [['pending_payment', 11], ['all', 17], ['pending_payment', 11]]) {
      await page.getByRole('button', { name: /^Filtros/ }).click();
      await page.getByLabel('Estado de reserva', { exact: true }).selectOption(filter);
      await page.getByRole('button', { name: 'Listo', exact: true }).click();
      await expect(nav).toContainText(`Mostrando 1–10 de ${total} reservas`);
      await nav.getByRole('button', { name: 'Siguiente' }).click();
      await expect(nav).toHaveAttribute('aria-busy', 'false');
    }
    await expect(page.locator('.admin-reservations-table tbody tr')).toHaveCount(1);
    await page.locator('.admin-reservations-table').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(nav).toContainText('Mostrando 1–10 de 10 reservas');
    await expect(nav.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  } finally { await f.browser.close(); }
});

test('reviews, gallery and package lists use backend ranges and reset filters', async () => {
  const f = await fixture(); const { page } = f;
  try {
    for (const [route, noun, table] of [['reviews', 'reseñas', 'reviews'], ['gallery', 'imágenes', 'gallery_images'], ['boat-tours', 'paquetes', 'tour_packages']]) {
      await page.goto(`${base}/admin/${route}`);
      const nav = page.getByRole('navigation', { name: `Paginación de ${noun}` });
      await expect(nav).toContainText(`Mostrando 1–10 de 76 ${noun}`);
      await nav.getByRole('button', { name: 'Siguiente' }).click();
      await expect(nav).toContainText(`Mostrando 11–20 de 76 ${noun}`);
      assert.equal(f.requests.filter((r) => r.table === table).at(-1).start, 10);
      if (route === 'reviews') await page.locator('.admin-toolbar select').selectOption('pending');
      if (route === 'gallery') { await expect(page.locator('.admin-toolbar select option[value="custom"]')).toHaveCount(1); await page.locator('.admin-toolbar select').selectOption('custom'); }
      if (route === 'boat-tours') await page.locator('.admin-toolbar select').selectOption('boat-2');
      await expect(nav).toContainText('Mostrando 1–10');
      const request = f.requests.filter((r) => r.table === table).at(-1);
      assert.equal(request.start, 0);
      if (route === 'boat-tours') assert.match(request.select, /boat_tours!inner/);
      await page.setViewportSize({ width: 375, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
  } finally { await f.browser.close(); }
});
