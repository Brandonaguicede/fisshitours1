// Reservas: "Crear reserva manual" form, the real .xlsx / PDF exports and the KPI cards.
// Runs against the dev server in test mode (see tests/run-admin-tests.mjs); Supabase is mocked at admin-test.supabase.co.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { chromium, expect } from '@playwright/test';

const bs = String.fromCharCode(92);
const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

const statusCycle = ['confirmed', 'pending_payment', 'pending_confirmation', 'pending', 'completed', 'cancelled', 'confirmed'];
function reservation(index, overrides = {}) {
  const status = statusCycle[index % statusCycle.length];
  return {
    id: `booking-${index}`, booking_reference: `PFT-${String(index + 1).padStart(4, '0')}`, boat_id: 'boat-1', tour_id: 'tour-1', tour_package_id: 'pkg-1', time_slot_id: 'slot-1',
    tour_date: `2026-10-${String(1 + (index % 28)).padStart(2, '0')}`, created_at: '2026-09-20T14:30:00Z', guests: 2 + (index % 4), total_snapshot: 350 + index,
    departure_location_name_snapshot: index % 2 ? 'Hotel Riu' : 'Marina', departure_surcharge_snapshot: index % 2 ? 25 : 0,
    payment_method_key: index % 2 ? 'whatsapp-link' : 'paypal', payment_status: status === 'confirmed' || status === 'completed' ? 'paid' : status === 'cancelled' ? 'failed' : 'pending', booking_status: status,
    customers: { full_name: `María José Pérez ${index + 1}`, email: `cliente${index + 1}@example.com`, whatsapp: '+506 8888 0000' },
    boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' }, time_slots: { label: '7:00 AM' }, special_requests: index === 0 ? '=HYPERLINK("http://evil")' : '',
    ...overrides,
  };
}

const catalogPackage = {
  id: 'pkg-1', name: 'Half Day', base_price: 600, included_guests: 4, max_guests: 12, extra_guest_price: 50, custom_quote: false, departure_times: null, package_included: null,
  duration_minutes: 240, image_url: null, active: true, sort_order: 1, meal_options: null, package_type: 'private', description: '',
  boat_tours: { id: 'bt-1', boat_id: 'boat-1', tour_id: 'tour-1', active: true, boats: { active: true, max_guests: 8 }, tours: { id: 'tour-1', title: 'Fishing Tour', category: 'Fishing', image_url: null, active: true, sort_order: 1, description: '', highlights: [], included: [] } },
};

async function fixture({ bookings = Array.from({ length: 14 }, (_, i) => reservation(i)), viewport = { width: 1440, height: 1000 } } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport, acceptDownloads: true });
  const listRequests = [];
  const createRequests = [];
  const statRequests = [];
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'test-admin-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('/rpc/list_admin_bookings')) {
      const input = request.postDataJSON(); listRequests.push(input);
      const rows = bookings.filter((row) => (input.p_booking_status === 'all' || row.booking_status === input.p_booking_status)
        && (input.p_payment_status === 'all' || row.payment_status === input.p_payment_status)
        && (!input.p_tour_date || row.tour_date === input.p_tour_date)
        && (!input.p_search || [row.booking_reference, row.customers.full_name, row.customers.email, row.customers.whatsapp, row.boats.name, row.tours.title].join(' ').toLowerCase().includes(input.p_search.toLowerCase())))
        .sort((a, b) => a.tour_date.localeCompare(b.tour_date) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
      return route.fulfill({ json: { rows: rows.slice(input.p_offset, input.p_offset + input.p_limit), total: rows.length } });
    }
    if (path.endsWith('/functions/v1/admin-create-booking')) {
      createRequests.push(request.postDataJSON());
      return route.fulfill({ json: { booking_reference: 'PFT-NEW-0001' } });
    }
    if (path.endsWith('/rest/v1/bookings')) {
      // Honors supabase-js .range() (offset/limit) like PostgREST does, so the >1000-row paging is really exercised.
      const offset = Number(url.searchParams.get('offset') ?? 0); const limit = Number(url.searchParams.get('limit') ?? bookings.length);
      if (url.searchParams.get('select') === 'booking_status') statRequests.push({ offset, limit });
      return route.fulfill({ json: bookings.slice(offset, offset + limit) });
    }
    if (path.endsWith('/rest/v1/time_slots')) return route.fulfill({ json: [{ id: 'slot-1', label: '7:00 AM', starts_at: '07:00:00' }, { id: 'slot-2', label: '1:00 PM', starts_at: '13:00:00' }] });
    if (path.endsWith('/rest/v1/tour_packages')) return route.fulfill({ json: [catalogPackage] });
    if (path.endsWith('/rest/v1/departure_locations')) return route.fulfill({ json: [{ id: 'loc-1', name: 'Marina', slug: 'marina', surcharge_amount: 0, currency: 'USD', active: true, sort_order: 1, is_default: true }, { id: 'loc-2', name: 'Hotel Riu', slug: 'riu', surcharge_amount: 25, currency: 'USD', active: true, sort_order: 2, is_default: false }] });
    if (path.endsWith('/rest/v1/payment_methods')) return route.fulfill({ json: [{ key: 'paypal', name: 'PayPal' }, { key: 'whatsapp-link', name: 'WhatsApp / link de pago' }] });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}/admin/login`, { timeout: 90_000 });
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await page.waitForURL(/\/admin(\/|$)/);
  await page.goto(`${base}/admin/reservations`);
  await expect(page.getByRole('navigation', { name: 'Paginación de reservas' })).toContainText('de');
  return { browser, page, listRequests, createRequests, statRequests };
}

async function download(page, buttonName) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const file = await pending;
  return { name: file.suggestedFilename(), bytes: await fs.readFile(await file.path()) };
}

const stat = (page, label) => page.locator('.admin-stat-card').filter({ has: page.locator('.admin-stat-card__label', { hasText: new RegExp(`^${label}$`) }) }).locator('.admin-stat-card__value');

// --- cards -----------------------------------------------------------------------------------------------------

test('KPI cards count each real status correctly (Reservas, Pendientes, Confirmadas, Canceladas), independent of the list filters', async () => {
  const bookings = [...Array.from({ length: 14 }, (_, i) => reservation(i))];
  const expected = { total: 14, pending: 6, confirmed: 4, cancelled: 2 };
  // statusCycle x14 = confirmed x4, pending_payment x2, pending_confirmation x2, pending x2, cancelled x2, plus completed x2,
  // which has no card: it counts toward Reservas only, so the status cards deliberately do not add up to the total.
  const f = await fixture({ bookings }); const { page } = f;
  try {
    await expect(stat(page, 'Reservas')).toHaveText(String(expected.total));
    await expect(stat(page, 'Pendientes')).toHaveText(String(expected.pending));
    await expect(stat(page, 'Confirmadas')).toHaveText(String(expected.confirmed));
    await expect(page.locator('.admin-stat-card')).toHaveCount(4);
    await expect(page.locator('.admin-stat-card__label')).toHaveText(['Reservas', 'Pendientes', 'Confirmadas', 'Canceladas']);
    await expect(stat(page, 'Canceladas')).toHaveText(String(expected.cancelled));
    await page.getByRole('button', { name: /^Filtros/ }).click();
    await page.getByLabel('Estado de reserva', { exact: true }).selectOption('cancelled');
    await expect(page.getByRole('navigation', { name: 'Paginación de reservas' })).toContainText('de 2 reservas');
    await expect(stat(page, 'Reservas')).toHaveText(String(expected.total));
    await expect(stat(page, 'Pendientes')).toHaveText(String(expected.pending));
  } finally { await f.browser.close(); }
});

test('KPI cards read past the 1000-row PostgREST cap', async () => {
  const bookings = Array.from({ length: 2350 }, (_, i) => reservation(i));
  const count = (status) => bookings.filter((row) => row.booking_status === status).length;
  const f = await fixture({ bookings }); const { page } = f;
  try {
    await expect(stat(page, 'Reservas')).toHaveText('2350');
    await expect(stat(page, 'Confirmadas')).toHaveText(String(count('confirmed')));
    await expect(stat(page, 'Canceladas')).toHaveText(String(count('cancelled')));
    await expect(stat(page, 'Pendientes')).toHaveText(String(count('pending') + count('pending_payment') + count('pending_confirmation')));
    assert.ok(f.statRequests.length >= 3, `expected paged reads, got ${JSON.stringify(f.statRequests)}`);
  } finally { await f.browser.close(); }
});

// --- Crear reserva manual ----------------------------------------------------------------------------------------

test('Crear reserva manual: aligned grid, uniform controls, full-width notes, primary action first, unchanged payload and total', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.getByRole('button', { name: 'Crear reserva', exact: true }).click();
    const dialog = page.locator('.admin-reservation-modal');
    await expect(dialog.getByRole('heading', { name: 'Crear reserva manual' })).toBeVisible();
    await expect(page.locator('.admin-reservation-form select').first()).toHaveValue('pkg-1');
    await page.waitForTimeout(700); // let the modal's open animation settle before measuring
    const box = async (locator) => { const b = await locator.boundingBox(); assert.ok(b); return b; };
    const controls = dialog.locator('.admin-reservation-form .admin-input:not(textarea), .admin-reservation-form .admin-select');
    const heights = await controls.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    assert.equal(new Set(heights).size, 1, `inputs and selects share one height: ${heights}`);
    const name = await box(dialog.getByLabel('Nombre del cliente')); const email = await box(dialog.getByLabel('Email'));
    const whatsapp = await box(dialog.getByLabel('WhatsApp')); const country = await box(dialog.getByLabel('Pais'));
    const tour = await box(dialog.getByLabel('Tour / paquete'));
    const rowFour = [await box(dialog.getByLabel('Fecha')), await box(dialog.getByLabel('Hora')), await box(dialog.getByLabel('Personas')), await box(dialog.getByLabel('Lugar de salida'))];
    const notes = await box(dialog.getByLabel('Notas'));
    assert.equal(Math.round(name.y), Math.round(email.y)); assert.equal(Math.round(whatsapp.y), Math.round(country.y));
    assert.equal(new Set(rowFour.map((b) => Math.round(b.y))).size, 1, 'date/time/people/departure share one row and baseline');
    assert.equal(new Set(rowFour.map((b) => Math.round(b.width))).size, 1, 'the four row-four controls have equal width');
    const gaps = [email.x - (name.x + name.width), country.x - (whatsapp.x + whatsapp.width), ...rowFour.slice(1).map((b, i) => b.x - (rowFour[i].x + rowFour[i].width))].map(Math.round);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `uniform column gaps: ${gaps}`);
    const verticalGaps = [whatsapp.y - (name.y + name.height), tour.y - (whatsapp.y + whatsapp.height), rowFour[0].y - (tour.y + tour.height), notes.y - (rowFour[0].y + rowFour[0].height)];
    assert.ok(Math.max(...verticalGaps) - Math.min(...verticalGaps) <= 28, `row rhythm stays even: ${verticalGaps}`);
    assert.equal(Math.round(notes.x), Math.round(tour.x)); assert.equal(Math.round(notes.width), Math.round(tour.width));
    assert.equal(Math.round(tour.width), Math.round(email.x + email.width - name.x), 'tour and notes span both columns');
    // "Máximo X" lives in the label row: same row, no extra height, and it is the package/boat minimum (8).
    await expect(dialog.locator('#manual-booking-guests-help')).toHaveText('Máximo 8');
    const help = await box(dialog.locator('#manual-booking-guests-help')); const guestsInput = await box(dialog.getByLabel('Personas'));
    assert.ok(help.y + help.height <= guestsInput.y + 1, 'the hint sits above the input, not inside the row flow');
    // Primary first in DOM / tab order, then Cancelar.
    assert.deepEqual((await dialog.locator('.admin-modal-footer button').allTextContents()).map((t) => t.trim()), ['Crear reserva', 'Cancelar']);
    await expect(dialog.locator('.admin-modal-footer button').first()).toHaveClass(/admin-btn(?!--)/);
    await expect(dialog.locator('.admin-modal-footer button').first()).not.toHaveClass(/admin-btn--secondary/);
    await expect(dialog.locator('.admin-modal-footer button').first()).toHaveAttribute('type', 'submit');
    // Total: 600 + (6 - 4) * 50 + 25 = 725 — the same estimate as before.
    await dialog.getByLabel('Personas').fill('6');
    await dialog.getByLabel('Lugar de salida').selectOption('loc-2');
    await expect(dialog.locator('.admin-reservation-total__amount')).toHaveText('$725');
    await expect(dialog.locator('.admin-reservation-total')).toContainText('El total definitivo lo recalcula Supabase al guardar.');
    await dialog.getByLabel('Nombre del cliente').fill('Ana Solano');
    await dialog.getByLabel('WhatsApp').fill('+506 7000 1111');
    await dialog.getByLabel('Fecha').fill('2026-11-05');
    await dialog.getByLabel('Notas').fill('Celebración');
    await dialog.getByRole('button', { name: 'Crear reserva', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Reserva PFT-NEW-0001 guardada como pendiente' })).toBeVisible();
    assert.equal(f.createRequests.length, 1);
    assert.deepEqual(f.createRequests[0], {
      customer: { fullName: 'Ana Solano', email: '', whatsapp: '+506 7000 1111', country: 'Costa Rica' },
      boatId: 'boat-1', tourId: 'tour-1', tourPackageId: 'pkg-1', tourDate: '2026-11-05', timeSlotId: 'slot-1', guests: 6, departureLocationId: 'loc-2',
      paymentMethodKey: 'whatsapp-link', extras: [], specialRequests: 'Celebración',
      adminNote: 'Reserva manual guardada desde WhatsApp/link. Pendiente de confirmación administrativa.',
    });
  } finally { await f.browser.close(); }
});

test('Crear reserva manual on a phone: single column, no horizontal overflow, actions stacked with the primary first', async () => {
  const f = await fixture({ viewport: { width: 375, height: 812 } }); const { page } = f;
  try {
    await page.getByRole('button', { name: 'Crear reserva', exact: true }).click();
    const dialog = page.locator('.admin-reservation-modal');
    await expect(dialog.getByRole('heading', { name: 'Crear reserva manual' })).toBeVisible();
    await page.waitForTimeout(700);
    const fields = await dialog.locator('.admin-reservation-form > *').evaluateAll((nodes) => nodes.map((node) => { const b = node.getBoundingClientRect(); return { x: Math.round(b.x), width: Math.round(b.width) }; }));
    assert.equal(new Set(fields.map((b) => b.x)).size, 1, 'one column');
    assert.equal(new Set(fields.map((b) => b.width)).size, 1, 'equal widths');
    const overflow = await dialog.locator('.admin-modal-body').evaluate((node) => node.scrollWidth - node.clientWidth);
    assert.ok(overflow <= 1, `no horizontal overflow (${overflow}px)`);
    const [primary, secondary] = await dialog.locator('.admin-modal-footer button').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().y)));
    assert.ok(primary < secondary, 'Crear reserva stacks above Cancelar');
  } finally { await f.browser.close(); }
});

// --- exports ---------------------------------------------------------------------------------------------------

const HEADERS = ['Referencia', 'Fecha del tour', 'Horario', 'Cliente', 'Correo electrónico', 'WhatsApp', 'Bote', 'Tour', 'Personas', 'Lugar de salida', 'Cargo de salida (USD)', 'Total (USD)', 'Método de pago', 'Estado del pago', 'Estado de la reserva', 'Notas', 'Creada el'];

test('Descargar Excel produces a real .xlsx (zip/OOXML, not CSV) with the filtered rows, ordered and styled', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.getByRole('button', { name: /^Filtros/ }).click();
    await page.getByLabel('Estado de reserva', { exact: true }).selectOption('confirmed');
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByRole('navigation', { name: 'Paginación de reservas' })).toContainText('de 4 reservas');
    f.listRequests.length = 0;
    const file = await download(page, 'Descargar Excel');
    assert.match(file.name, /^reservas-\d{4}-\d{2}-\d{2}\.xlsx$/);
    // Real container: ZIP signature + OOXML part names, and none of the CSV markers the old export had.
    assert.equal(file.bytes.subarray(0, 2).toString('latin1'), 'PK');
    assert.ok(file.bytes.includes(Buffer.from('[Content_Types].xml')), 'has [Content_Types].xml');
    assert.ok(file.bytes.includes(Buffer.from('xl/workbook.xml')), 'has xl/workbook.xml');
    assert.ok(file.bytes.includes(Buffer.from('xl/worksheets/sheet1.xml')), 'has a worksheet part');
    assert.notEqual(file.bytes.subarray(0, 3).toString('hex'), 'efbbbf', 'no UTF-8 BOM (that is what the CSV started with)');
    assert.ok(!file.bytes.subarray(0, 200).toString('utf8').includes('Referencia'), 'headers are not plain text at the start of the file');
    assert.ok(f.listRequests.every((request) => request.p_booking_status === 'confirmed'), 'the export honors the active filters');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.bytes);
    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Reservas', 'Resumen']);
    const sheet = workbook.getWorksheet('Reservas');
    assert.deepEqual(sheet.getRow(1).values.slice(1), HEADERS);
    assert.ok(!HEADERS.some((header) => /\bid\b|uuid|_id/i.test(header)), 'no technical id columns');
    assert.equal(sheet.rowCount, 5, 'header + the 4 confirmed reservations');
    assert.equal(sheet.views[0].state, 'frozen'); assert.equal(sheet.views[0].ySplit, 1);
    assert.ok(sheet.autoFilter, 'auto filter on the header');
    assert.equal(sheet.getRow(1).getCell(1).fill.fgColor.argb, 'FF2B5F82'); assert.equal(sheet.getRow(1).getCell(1).font.bold, true);
    assert.ok(HEADERS.every((_, i) => sheet.getColumn(i + 1).width >= 10), 'every column has an explicit width');
    const dates = sheet.getColumn(2).values.slice(2);
    assert.ok(dates.every((value) => value instanceof Date), 'tour dates are real Excel dates');
    assert.deepEqual(dates.map((value) => value.toISOString().slice(0, 10)), [...dates.map((value) => value.toISOString().slice(0, 10))].sort(), 'rows follow the list order (tour date ascending)');
    const first = sheet.getRow(2);
    assert.equal(first.getCell(1).value, 'PFT-0001');
    assert.equal(first.getCell(4).value, 'María José Pérez 1');
    assert.equal(typeof first.getCell(12).value, 'number'); assert.equal(first.getCell(12).numFmt, '"$"#,##0.00');
    assert.equal(first.getCell(14).value, 'Pagado'); assert.equal(first.getCell(15).value, 'Confirmada');
    assert.equal(first.getCell(13).value, 'PayPal');
    assert.equal(first.getCell(16).value, '=HYPERLINK("http://evil")', 'text that looks like a formula stays text');
    assert.equal(typeof first.getCell(16).value, 'string');
    const summary = workbook.getWorksheet('Resumen');
    assert.equal(summary.getCell('A1').value, 'Reporte de reservas');
    assert.ok(summary.getRow(7).getCell(2).value.includes('Estado de reserva: Confirmada'));
  } finally { await f.browser.close(); }
});

test('the workbook builder: all pages of a large list, no duplicated rows, empty state, currency and column order', async () => {
  const f = await fixture(); const { page } = f;
  try {
    const result = await page.evaluate(async () => {
      const { buildReservationExportRows, createReservationsXlsx, fetchAllReservations } = await import('/src/utils/reservationsExport.ts');
      const all = Array.from({ length: 120 }, (_, i) => ({ id: `id-${i}`, booking_reference: `R-${i}`, tour_date: '2026-10-01', guests: 2, total_snapshot: 100.5, payment_method_key: 'paypal', payment_status: 'paid', booking_status: 'confirmed', created_at: '2026-09-20T14:30:00Z', boat_id: '', tour_id: '', tour_package_id: '', time_slot_id: '', special_requests: null, departure_location_name_snapshot: null, departure_surcharge_snapshot: null, customers: null, boats: null, tours: null, time_slots: null }));
      const pages = [];
      // Page 2 repeats the last row of page 1 (a booking created while paging shifts offsets): it must appear once.
      const fetched = await fetchAllReservations(async (pageNumber, size) => { pages.push(pageNumber); const start = (pageNumber - 1) * size; return { rows: pageNumber === 2 ? all.slice(start - 1, start + size) : all.slice(start, start + size), total: 120 }; }, 50);
      const rows = buildReservationExportRows(fetched);
      const empty = await createReservationsXlsx({ rows: [], filters: [] });
      const blob = await createReservationsXlsx({ rows, filters: ['Búsqueda: "x"'], generatedAt: new Date(2026, 8, 24, 20, 41) });
      return { pages, fetched: fetched.length, rows: rows.length, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), type: blob.type, emptyBytes: Array.from(new Uint8Array(await empty.arrayBuffer())) };
    });
    assert.deepEqual(result.pages, [1, 2, 3]);
    assert.equal(result.rows, 120, 'the repeated booking is exported once');
    assert.equal(result.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(result.bytes));
    const sheet = workbook.getWorksheet('Reservas');
    assert.equal(sheet.rowCount, 121);
    assert.equal(sheet.getRow(2).getCell(12).value, 100.5);
    assert.equal(sheet.getRow(2).getCell(4).value, '', 'missing customer becomes an empty cell, never "undefined"/null text');
    assert.match(workbook.getWorksheet('Resumen').getRow(4).getCell(2).value, /24 de septiembre de 2026/);
    const empty = new ExcelJS.Workbook(); await empty.xlsx.load(Buffer.from(result.emptyBytes));
    assert.equal(empty.getWorksheet('Reservas').rowCount, 1, 'an empty result still has the styled header');
    assert.match(empty.getWorksheet('Resumen').getRow(7).getCell(2).value, /Sin filtros/);
  } finally { await f.browser.close(); }
});

test('Descargar PDF reuses the packages PDF look: brand header, date/time, filters, table, currency, Página X de Y', async () => {
  const f = await fixture(); const { page } = f;
  try {
    await page.getByLabel('Buscar reservas').fill('Second Wind');
    await expect(page.getByRole('navigation', { name: 'Paginación de reservas' })).toContainText('de 14 reservas');
    f.listRequests.length = 0;
    const file = await download(page, 'Descargar PDF');
    assert.match(file.name, /^reservas-\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.equal(file.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(file.bytes.length > 8000);
    assert.ok(f.listRequests.length >= 1 && f.listRequests.every((request) => request.p_search === 'Second Wind'), 'the PDF honors the active search');

    const result = await page.evaluate(async () => {
      const { createReservationsPdf } = await import('/src/utils/reservationsPdf.ts');
      const { loadLogoDataUrl } = await import('/src/utils/packagesPdf.ts');
      const row = (n) => ({ reference: `PFT-${n}`, tourDate: '2026-10-05', time: '7:00 AM', customer: `Cliente ${n}`, email: 'a@b.c', whatsapp: '+506 8888 0000', boat: 'Second Wind', tour: 'Fishing Tour', guests: 4, departure: 'Marina', departureSurcharge: 0, total: 1234.5, paymentMethod: 'PayPal', paymentStatus: 'Pagado', bookingStatus: 'Confirmada', notes: '', createdAt: '2026-09-20T14:30:00Z' });
      const logo = await loadLogoDataUrl();
      const doc = await createReservationsPdf({ rows: Array.from({ length: 40 }, (_, n) => row(n + 1)), filters: ['Estado de reserva: Confirmada', 'Fecha del tour: 05/10/2026'], generatedAt: new Date(2026, 8, 24, 20, 41), logoDataUrl: logo, compress: false });
      const empty = await createReservationsPdf({ rows: [], filters: [], generatedAt: new Date(2026, 8, 24, 20, 41), compress: false });
      const raw = (document) => { const buffer = new Uint8Array(document.output('arraybuffer')); let text = ''; for (const byte of buffer) text += String.fromCharCode(byte); return text; };
      return { pages: doc.getNumberOfPages(), hasLogo: Boolean(logo), text: raw(doc), emptyText: raw(empty) };
    });
    const pdfText = result.text.replaceAll(`${bs}(`, '(').replaceAll(`${bs})`, ')'); // PDF string literals escape parentheses
    assert.ok(result.hasLogo); assert.ok(result.pages >= 2, `40 rows must paginate (${result.pages})`);
    for (const expected of ['Reporte de reservas', 'Generado el 24 de septiembre de 2026', '40 reservas', 'FILTROS', 'Estado de reserva: Confirmada', 'Fecha del tour: 05/10/2026', 'Referencia', 'Total \(USD\)', '$1,234.50', 'Papagayo Fishing Tour', 'PFT-1)', 'PFT-40)', `gina 1 de ${result.pages}`, `gina ${result.pages} de ${result.pages}`]) {
      assert.ok(pdfText.includes(expected), `PDF must contain "${expected}"`);
    }
    assert.ok(result.text.includes('/Subtype /Image') || result.text.includes('/Type /XObject'), 'the logo is embedded');
    assert.ok(result.emptyText.includes('No hay reservas para los filtros seleccionados.'));
    assert.ok(result.emptyText.includes('Sin filtros: se incluyen todas las reservas.'));
  } finally { await f.browser.close(); }
});
