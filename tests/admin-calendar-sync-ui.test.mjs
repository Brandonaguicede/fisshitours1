// Reservas + Google Calendar: what the Admin does and shows. The booking is confirmed / edited / cancelled first (source of truth); the
// calendar is synced afterwards through `sync-reservation-calendar` with ONLY the reservation id. A Google problem never changes the
// booking: the editor shows "No sincronizada" with "Reintentar". Supabase and the Edge Functions are mocked (no real Google).
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base = process.env.ADMIN_TEST_BASE_URL ?? 'http://localhost:5174';
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

const booking = (id, status, extra = {}) => ({
  id, booking_reference: `PFT-${id.toUpperCase()}`, boat_id: 'boat-1', tour_id: 'tour-1', tour_package_id: 'pkg-1', time_slot_id: 'slot-1', tour_date: '2026-11-10', created_at: '2026-09-20T14:30:00Z', guests: 3, total_snapshot: 600,
  departure_location_name_snapshot: 'Marina', departure_surcharge_snapshot: 0, payment_method_key: 'whatsapp-link', payment_status: status === 'confirmed' ? 'paid' : 'pending', booking_status: status,
  customers: { full_name: `Cliente ${id}`, email: `${id}@example.com`, whatsapp: '+506 8888 0000' }, boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' }, time_slots: { label: '7:00 AM' }, special_requests: '', ...extra,
});
const catalogPackage = {
  id: 'pkg-1', name: 'Half Day', base_price: 600, included_guests: 4, max_guests: 12, extra_guest_price: 50, custom_quote: false, departure_times: null, package_included: null, duration_minutes: 240, image_url: null, active: true, sort_order: 1, meal_options: null, package_type: 'private', description: '',
  boat_tours: { id: 'bt-1', boat_id: 'boat-1', tour_id: 'tour-1', active: true, boats: { active: true, max_guests: 8 }, tours: { id: 'tour-1', title: 'Fishing Tour', category: 'Fishing', image_url: null, active: true, sort_order: 1, description: '', highlights: [], included: [] } },
};

async function fixture({ bookings, calendar = {}, sync = () => ({ status: 200, json: { status: 'synced', operation: 'create', eventId: 'evt' } }) }) {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = { bookings: bookings.map((row) => ({ ...row })), calendar: { ...calendar }, syncCalls: [], calls: [] };
  await page.route('https://admin-test.supabase.co/**', async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: 'test-admin-token', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/profiles')) return route.fulfill({ json: { ...user, full_name: 'Test Admin', role: 'admin', active: true } });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('/rpc/list_admin_bookings')) return route.fulfill({ json: { rows: state.bookings, total: state.bookings.length } });
    if (path.endsWith('/rpc/update_booking_status')) {
      const body = request.postDataJSON(); state.calls.push(['status', body.p_booking_status]);
      state.bookings = state.bookings.map((row) => (row.id === body.p_booking_id ? { ...row, booking_status: body.p_booking_status } : row));
      return route.fulfill({ json: {} });
    }
    if (path.endsWith('/functions/v1/admin-confirm-booking')) {
      const body = request.postDataJSON(); state.calls.push(['confirm', body.bookingId]);
      state.bookings = state.bookings.map((row) => (row.id === body.bookingId ? { ...row, booking_status: 'confirmed', payment_status: 'paid' } : row));
      return route.fulfill({ json: { customerEmailPresent: true, emailQueued: true } });
    }
    if (path.endsWith('/functions/v1/admin-update-booking')) { state.calls.push(['update', request.postDataJSON().bookingId]); return route.fulfill({ json: { booking_id: 'x' } }); }
    if (path.endsWith('/functions/v1/sync-reservation-calendar')) {
      const body = request.postDataJSON(); state.syncCalls.push(body); state.calls.push(['sync', body.reservationId]);
      const planned = sync(state.syncCalls.length, body);
      if (planned === 'abort') return route.abort();
      if (planned.json?.status === 'synced') state.calendar[body.reservationId] = { google_calendar_sync_status: 'synced', google_calendar_sync_error: null };
      if (planned.json?.status === 'failed') state.calendar[body.reservationId] = { google_calendar_sync_status: 'failed', google_calendar_sync_error: planned.json.error ?? 'Google Calendar respondió 500.' };
      return route.fulfill({ status: planned.status, json: planned.json });
    }
    if (path.endsWith('/rest/v1/bookings')) {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      if (id) {
        const cal = state.calendar[id] ?? { google_calendar_sync_status: null, google_calendar_sync_error: null };
        const object = (request.headers().accept ?? '').includes('vnd.pgrst.object');
        return route.fulfill({ json: object ? cal : [cal] });
      }
      return route.fulfill({ json: state.bookings });
    }
    if (path.endsWith('/rest/v1/time_slots')) return route.fulfill({ json: [{ id: 'slot-1', label: '7:00 AM', starts_at: '07:00:00' }] });
    if (path.endsWith('/rest/v1/tour_packages')) return route.fulfill({ json: [catalogPackage] });
    if (path.endsWith('/rest/v1/departure_locations')) return route.fulfill({ json: [{ id: 'loc-1', name: 'Marina', slug: 'marina', surcharge_amount: 0, currency: 'USD', active: true, sort_order: 1, is_default: true }] });
    if (path.endsWith('/rest/v1/payment_methods')) return route.fulfill({ json: [{ key: 'whatsapp-link', name: 'WhatsApp' }] });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}/admin/login`, { timeout: 90_000 });
  await page.getByPlaceholder('admin@example.com').fill(user.email);
  await page.getByPlaceholder('Password').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
  await page.waitForURL(/\/admin(\/|$)/);
  await page.goto(`${base}/admin/reservations`);
  await expect(page.locator('.admin-reservations-table tbody tr').first()).toBeVisible();
  return { browser, page, state };
}

const row = (page, id) => page.locator('.admin-reservations-table tbody tr').filter({ hasText: `PFT-${id.toUpperCase()}` });
const openEditor = async (page, id) => { await row(page, id).getByRole('button', { name: /Editar reserva/ }).click(); await expect(page.getByRole('heading', { name: 'Editar reserva' })).toBeVisible(); };
const calendarRow = (page) => page.getByRole('group', { name: 'Google Calendar' });
const confirmFromTable = async (page, id) => {
  await row(page, id).getByRole('button', { name: /Confirmar/ }).click();
  await page.locator('.admin-modal-card').getByRole('button', { name: 'Confirmar', exact: true }).click();
};

test('confirming: the booking is confirmed FIRST, then the calendar is synced with ONLY the reservation id, and the editor shows "Agendada"', async () => {
  const f = await fixture({ bookings: [booking('b1', 'pending_confirmation')] }); const { page, state } = f;
  try {
    await confirmFromTable(page, 'b1');
    await expect(page.getByText(/Agendada en Google Calendar\./)).toBeVisible();
    assert.deepEqual(state.calls.map((call) => call[0]), ['confirm', 'sync']);
    assert.deepEqual(state.syncCalls, [{ reservationId: 'b1' }], 'nothing but the id is sent (no title, price, times or customer data)');
    await expect(row(page, 'b1')).toContainText('Confirmada');
    await openEditor(page, 'b1');
    await expect(calendarRow(page).getByText('Agendada')).toBeVisible();
    await expect(calendarRow(page).getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  } finally { await f.browser.close(); }
});

test('Google fails after confirming: the booking STAYS confirmed, the editor says "No sincronizada" with Reintentar, and retrying turns it into "Agendada"', async () => {
  const f = await fixture({ bookings: [booking('b2', 'pending_confirmation')], sync: (n) => (n === 1 ? { status: 200, json: { status: 'failed', error: 'Google Calendar respondió 500.' } } : { status: 200, json: { status: 'synced', operation: 'create', eventId: 'evt' } }) }); const { page, state } = f;
  try {
    await confirmFromTable(page, 'b2');
    await expect(page.getByText(/No se pudo agendar en Google Calendar: reintenta desde Editar reserva\./)).toBeVisible();
    await expect(row(page, 'b2')).toContainText('Confirmada'); // the booking is untouched by the calendar failure
    await expect(row(page, 'b2').getByRole('button', { name: /Reintentar/ })).toHaveCount(0); // no calendar button in the table
    await openEditor(page, 'b2');
    await expect(calendarRow(page).getByText('No sincronizada')).toBeVisible();
    await calendarRow(page).getByRole('button', { name: 'Reintentar' }).click();
    await expect(calendarRow(page).getByText('Agendada')).toBeVisible();
    await expect(calendarRow(page).getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    assert.deepEqual(state.syncCalls, [{ reservationId: 'b2' }, { reservationId: 'b2' }]);
    assert.equal(state.bookings[0].booking_status, 'confirmed');
  } finally { await f.browser.close(); }
});

test('the function being unreachable (network / auth) is also just "No sincronizada": the booking is still confirmed', async () => {
  const f = await fixture({ bookings: [booking('b3', 'pending_confirmation')], sync: () => 'abort' }); const { page, state } = f;
  try {
    await confirmFromTable(page, 'b3');
    await expect(page.getByText(/No se pudo agendar en Google Calendar/)).toBeVisible();
    await expect(row(page, 'b3')).toContainText('Confirmada');
    assert.equal(state.bookings[0].booking_status, 'confirmed');
    await openEditor(page, 'b3');
    await expect(calendarRow(page).getByText('No sincronizada')).toBeVisible();
    await expect(calendarRow(page).getByRole('button', { name: 'Reintentar' })).toBeVisible();
  } finally { await f.browser.close(); }
});

test('editor states: pending = "Sincronizando...", synced = "Agendada", failed = "No sincronizada" + Reintentar (only there); pending / cancelled bookings show no calendar row', async () => {
  const bookings = [booking('sy', 'confirmed'), booking('pe', 'confirmed'), booking('fa', 'confirmed'), booking('nu', 'confirmed'), booking('pn', 'pending'), booking('ca', 'cancelled')];
  const calendar = { sy: { google_calendar_sync_status: 'synced' }, pe: { google_calendar_sync_status: 'pending' }, fa: { google_calendar_sync_status: 'failed', google_calendar_sync_error: 'Google Calendar respondió 500.' } };
  const f = await fixture({ bookings, calendar }); const { page } = f;
  try {
    const close = () => page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await openEditor(page, 'sy');
    await expect(calendarRow(page).getByText('Agendada')).toBeVisible();
    await expect(calendarRow(page).getByRole('button')).toHaveCount(0);
    await close();
    await openEditor(page, 'pe');
    await expect(calendarRow(page).getByText('Sincronizando...')).toBeVisible();
    await expect(calendarRow(page).getByRole('button')).toHaveCount(0);
    await close();
    await openEditor(page, 'fa');
    await expect(calendarRow(page).getByText('No sincronizada')).toBeVisible();
    await expect(calendarRow(page).getByRole('button')).toHaveText(['Reintentar']);
    await close();
    await openEditor(page, 'nu');
    await expect(calendarRow(page).getByText('Sin sincronizar')).toBeVisible();
    await expect(calendarRow(page).getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await close();
    for (const id of ['pn', 'ca']) {
      await openEditor(page, id);
      await expect(calendarRow(page)).toHaveCount(0);
      await close();
    }
  } finally { await f.browser.close(); }
});

test('editing a CONFIRMED booking updates the same calendar event (one sync call); editing a pending one does not touch the calendar', async () => {
  const f = await fixture({ bookings: [booking('ed', 'confirmed'), booking('pd', 'pending')], calendar: { ed: { google_calendar_sync_status: 'synced' } } }); const { page, state } = f;
  try {
    await openEditor(page, 'ed');
    await page.getByLabel('Personas').fill('5');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText(/Cambios guardados/)).toBeVisible();
    await expect.poll(() => state.calls.filter((call) => call[0] === 'sync').length).toBe(1);
    assert.deepEqual(state.calls.map((call) => call[0]), ['update', 'sync']);
    assert.deepEqual(state.syncCalls, [{ reservationId: 'ed' }]);
    await openEditor(page, 'pd');
    await page.getByLabel('Personas').fill('4');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText(/Cambios guardados/)).toBeVisible();
    assert.equal(state.calls.filter((call) => call[0] === 'sync').length, 1, 'no new sync for a pending booking');
  } finally { await f.browser.close(); }
});

test('cancelling a confirmed booking syncs the calendar afterwards (the function marks the same event [CANCELADA])', async () => {
  const f = await fixture({ bookings: [booking('cx', 'confirmed')], calendar: { cx: { google_calendar_sync_status: 'synced' } } }); const { page, state } = f;
  try {
    await openEditor(page, 'cx');
    await page.getByRole('button', { name: 'Cancelar reserva' }).click();
    await page.getByRole('button', { name: /Sí, cancelar reserva/ }).click();
    await expect.poll(() => state.calls.map((call) => call[0]).join('>')).toBe('status>sync');
    assert.deepEqual(state.syncCalls, [{ reservationId: 'cx' }]);
    assert.equal(state.bookings[0].booking_status, 'cancelled');
  } finally { await f.browser.close(); }
});
