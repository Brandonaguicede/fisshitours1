import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
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
  let slowConfirm = false;
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
    if (path.endsWith('/admin-retry-confirmation-email')) {
      const input = request.postDataJSON(); writes.push({ name: 'retry-email', ...input });
      return route.fulfill({ json: { customerEmailPresent: true, queued: 1 } });
    }
    if (path.endsWith('/admin-confirm-booking')) {
      if (slowConfirm) await new Promise((resolve) => setTimeout(resolve, 600));
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
  return { browser, page, requests, writes, bookings, setFail: (value) => { fail = value; }, setSlow: (value) => { slow = value; }, setSlowConfirm: (value) => { slowConfirm = value; } };
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
    await page.locator('.admin-reservations-table').getByRole('button', { name: /Editar reserva/ }).click();
    await expect(page.getByRole('heading', { name: 'Editar reserva' })).toBeVisible();
    // The modal has two "Cerrar" controls: the header's icon-only close button
    // (aria-label) and the footer's text button — scope to the footer.
    await page.locator('.admin-modal-footer').getByRole('button', { name: 'Cerrar', exact: true }).click();
    // "Confirmar" abre un diálogo: Cancelar no escribe nada; confirmar sí ejecuta la acción real.
    const confirmButton = page.locator('.admin-reservations-table').getByRole('button', { name: /Confirmar/ });
    await expect(confirmButton).toContainText('Confirmar');
    await confirmButton.click();
    await expect(page.getByRole('heading', { name: 'Confirmar reserva' })).toBeVisible();
    await page.locator('.admin-modal-card').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Confirmar reserva' })).toHaveCount(0);
    assert.equal(f.writes.length, 0);
    await confirmButton.click();
    await page.locator('.admin-modal-card').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(nav).toContainText('Mostrando 0–0 de 0 reservas');
    assert.equal(f.writes[0].bookingId, 'booking-1');
    assert.equal(f.writes.length, 1);
    await page.getByLabel('Buscar reservas').fill('no existen resultados');
    await expect(page.locator('.admin-reservations-table')).toContainText('No hay reservas para este filtro.');
  } finally { await f.browser.close(); }
});

test('row actions follow the real booking state: Confirmar only when confirmable, Reenviar correo only on confirmed without email sent', async () => {
  const f = await fixture(); const { page } = f;
  try {
    f.bookings[1].booking_status = 'cancelled'; f.bookings[1].payment_status = 'failed';
    f.bookings[2].payment_method_key = 'paypal'; // PayPal sin pago verificado: no se puede confirmar
    await page.goto(`${base}/admin/reservations`);
    const row = (ref) => page.getByRole('row').filter({ hasText: ref });
    await expect(row('PFT-005')).toBeVisible();
    // pendiente (WhatsApp) → Confirmar
    await expect(row('PFT-005').getByRole('button', { name: /Confirmar/ })).toBeEnabled();
    await expect(row('PFT-005').getByRole('button', { name: /Confirmar/ })).toContainText('Confirmar');
    await expect(row('PFT-005').getByRole('button', { name: /Reenviar correo/ })).toHaveCount(0);
    // confirmada → sin Confirmar, con Reenviar correo (tiene email y no hay envío registrado)
    await expect(row('PFT-001').getByRole('button', { name: /Confirmar/ })).toHaveCount(0);
    await expect(row('PFT-001').getByRole('button', { name: /Reenviar correo/ })).toContainText('Reenviar correo');
    await expect(row('PFT-001').getByRole('button', { name: /Editar reserva/ })).toBeEnabled();
    // cancelada → solo editar
    await expect(row('PFT-002').getByRole('button', { name: /Confirmar|Reenviar/ })).toHaveCount(0);
    await expect(row('PFT-002').getByRole('button', { name: /Editar reserva/ })).toBeEnabled();
    // PayPal pendiente de pago → no se puede confirmar
    await expect(row('PFT-003').getByRole('button', { name: /Confirmar/ })).toHaveCount(0);
    // la columna no se desborda: botones dentro de la celda (Editar + Confirmar en una línea; Reenviar correo puede bajar de línea), sin scroll de la tabla ni de la página
    const layout = await page.locator('.admin-reservations-table tbody tr').evaluateAll((trs) => trs.map((tr) => {
      const cell = tr.lastElementChild.getBoundingClientRect(); const buttons = [...tr.lastElementChild.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
      const centers = buttons.map((b) => b.top + b.height / 2); return { oneLine: tr.lastElementChild.textContent.includes('Reenviar') || Math.max(...centers) - Math.min(...centers) < 2, inside: buttons.every((b) => b.left >= cell.left - 0.5 && b.right <= cell.right + 0.5) };
    }));
    assert.ok(layout.every((r) => r.oneLine && r.inside), JSON.stringify(layout));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const wrap = await page.evaluate(() => { const w = document.querySelector('.admin-table-wrap'); return { scroll: w.scrollWidth, client: w.clientWidth, cols: [...document.querySelectorAll('.admin-reservations-table th')].map((t) => t.textContent + ':' + Math.round(t.getBoundingClientRect().width)).join(' ') }; });
    assert.ok(wrap.scroll <= wrap.client, JSON.stringify(wrap));
    // Reenviar correo ejecuta la función real de reintento (no confirma ni cambia estados)
    await row('PFT-001').getByRole('button', { name: /Reenviar correo/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'La confirmación quedó encolada para reintento.' })).toBeVisible();
    assert.deepEqual(f.writes.map((w) => w.name), ['retry-email']);
    assert.equal(f.writes[0].bookingId, 'booking-0');
  } finally { await f.browser.close(); }
});

test('Confirmar shows loading, blocks double clicks and the row turns confirmed', async () => {
  const f = await fixture(); const { page } = f;
  try {
    f.setSlowConfirm(true);
    await page.goto(`${base}/admin/reservations`);
    const row = page.getByRole('row').filter({ hasText: 'PFT-005' });
    await row.getByRole('button', { name: /Confirmar/ }).click();
    const dialog = page.locator('.admin-modal-card');
    await expect(dialog).toContainText('¿Confirmar esta reserva');
    const confirm = dialog.getByRole('button', { name: 'Confirmar', exact: true });
    await confirm.dblclick();
    await expect(confirm).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Confirmar reserva' })).toHaveCount(0);
    assert.equal(f.writes.filter((w) => w.name === 'confirm').length, 1);
    assert.equal(f.writes[0].bookingId, 'booking-4');
    await expect(row.locator('.admin-badge').last()).toHaveText('confirmed');
    await expect(row.getByRole('button', { name: /Confirmar/ })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Reserva confirmada' })).toBeVisible();
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
    // Cancelar ya no es un botón directo en la card — vive dentro de "Editar" >
    // zona de peligro, con una confirmación explícita separada.
    const card = page.locator('.admin-reservation-card').nth(1);
    await card.getByRole('button', { name: /Editar reserva/ }).click();
    await expect(page.getByRole('heading', { name: 'Editar reserva' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar reserva' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar reserva' }).click();
    await expect(card).toContainText('cancelled');
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
    await page.locator('.admin-reservations-table').getByRole('button', { name: /Confirmar/ }).click();
    await page.locator('.admin-modal-card').getByRole('button', { name: 'Confirmar', exact: true }).click();
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
      // Los filtros ahora viven dentro del popover "Filtros", no como <select> suelto en el toolbar.
      await page.getByRole('button', { name: /^Filtros/ }).click();
      if (route === 'reviews') await page.locator('.admin-filter-panel select').selectOption('pending');
      if (route === 'gallery') { await expect(page.locator('.admin-filter-panel select option[value="custom"]')).toHaveCount(1); await page.locator('.admin-filter-panel select').selectOption('custom'); }
      if (route === 'boat-tours') await page.locator('.admin-filter-panel select').first().selectOption('boat-2');
      await expect(nav).toContainText('Mostrando 1–10');
      // The filter request is recorded by the mock a moment after the UI text updates.
      await expect.poll(() => f.requests.filter((r) => r.table === table).at(-1)?.start).toBe(0);
      const request = f.requests.filter((r) => r.table === table).at(-1);
      if (route === 'boat-tours') assert.match(request.select, /boat_tours!inner/);
      await page.setViewportSize({ width: 375, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
  } finally { await f.browser.close(); }
});
