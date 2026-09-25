// Dashboard KPI semantics (src/utils/dashboardMetrics.ts) and the data flow behind them
// (src/services/adminDashboardService.ts -> PostgREST requests -> KPI values). No browser needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

function load(file, context) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export (const|let) /gm, 'var ').replace(/^export /gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return context;
}

function metrics() {
  return load('src/utils/dashboardMetrics.ts', vm.createContext({ Number, Math, Set, Array }));
}

let seq = 0;
const booking = (overrides = {}) => ({
  id: `b-${++seq}`, payment_status: 'pending', booking_status: 'pending_payment', payment_method_key: 'whatsapp-link', total_snapshot: 100, payments: [], ...overrides,
});

test('Reservas totales counts every booking, whatever its status', () => {
  const { computeDashboardKpis } = metrics();
  const rows = ['pending', 'pending_payment', 'pending_confirmation', 'confirmed', 'cancelled', 'completed'].map((booking_status) => booking({ booking_status }));
  assert.equal(computeDashboardKpis(rows).totalReservations, 6);
  assert.equal(computeDashboardKpis([]).totalReservations, 0);
});

test('Pagos pendientes counts payment_status pending and processing only', () => {
  const { computeDashboardKpis, PENDING_PAYMENT_STATUSES } = metrics();
  assert.deepEqual([...PENDING_PAYMENT_STATUSES], ['pending', 'processing']);
  const rows = ['pending', 'processing', 'paid', 'failed', 'refunded', 'not_required_yet'].map((payment_status) => booking({ payment_status }));
  // paid, failed (also cancelled/expired unpaid), refunded and pay-on-tour are not "pending payments".
  assert.equal(computeDashboardKpis(rows).pendingPayments, 2);
});

test('Pagos confirmados counts payment_status paid only (refunded is not confirmed)', () => {
  const { computeDashboardKpis } = metrics();
  const rows = ['paid', 'paid', 'refunded', 'pending', 'processing', 'failed', 'not_required_yet'].map((payment_status) => booking({ payment_status }));
  assert.equal(computeDashboardKpis(rows).confirmedPayments, 2);
});

test('Ingresos sums money collected on paid bookings and never a hardcoded value', () => {
  const { computeDashboardKpis } = metrics();
  assert.equal(computeDashboardKpis([]).revenue, 0);
  // Nothing paid yet -> 0 even though bookings have totals.
  assert.equal(computeDashboardKpis([booking({ total_snapshot: 500 }), booking({ payment_status: 'not_required_yet', total_snapshot: 300 })]).revenue, 0);

  const rows = [
    // admin-confirmed WhatsApp payment: no payments row, total_snapshot is the recorded amount
    booking({ payment_status: 'paid', booking_status: 'confirmed', total_snapshot: 350 }),
    // PayPal capture: the captured amount wins over a total edited afterwards
    booking({ payment_status: 'paid', payment_method_key: 'paypal', total_snapshot: 999, payments: [{ amount: 600, status: 'paid' }] }),
    // decimals come back as JSON numbers or strings and must not drift
    booking({ payment_status: 'paid', total_snapshot: '100.10' }),
    booking({ payment_status: 'paid', total_snapshot: 0.2 }),
    // not collected: pending, failed, refunded (even with a total and a paid-looking payments row)
    booking({ payment_status: 'pending', total_snapshot: 1000 }),
    booking({ payment_status: 'failed', booking_status: 'cancelled', total_snapshot: 1000 }),
    booking({ payment_status: 'refunded', total_snapshot: 1000, payments: [{ amount: 1000, status: 'refunded' }] }),
  ];
  const result = computeDashboardKpis(rows);
  assert.equal(result.revenue, 1050.3);
  assert.equal(result.confirmedPayments, 4);

  // A paid booking that was later cancelled but not refunded still holds the money.
  assert.equal(computeDashboardKpis([booking({ payment_status: 'paid', booking_status: 'cancelled', total_snapshot: 200 })]).revenue, 200);
  // Only `paid` payments rows count; a stale pending PayPal attempt falls back to the booking total.
  assert.equal(computeDashboardKpis([booking({ payment_status: 'paid', total_snapshot: 250, payments: [{ amount: 250, status: 'pending' }] })]).revenue, 250);
  // Two paid captures on one booking are both real money.
  assert.equal(computeDashboardKpis([booking({ payment_status: 'paid', total_snapshot: 100, payments: [{ amount: 100, status: 'paid' }, { amount: 100, status: 'paid' }] })]).revenue, 200);
});

test('Reservas por confirmar counts open booking statuses, excluding PayPal bookings not yet paid', () => {
  const { computeDashboardKpis, OPEN_BOOKING_STATUSES } = metrics();
  assert.deepEqual([...OPEN_BOOKING_STATUSES], ['pending', 'pending_payment', 'pending_confirmation']);
  const count = (overrides) => computeDashboardKpis([booking(overrides)]).reservationsToConfirm;
  for (const booking_status of ['pending', 'pending_payment', 'pending_confirmation']) assert.equal(count({ booking_status }), 1, booking_status);
  for (const booking_status of ['confirmed', 'cancelled', 'completed']) assert.equal(count({ booking_status }), 0, booking_status);
  // pay-on-tour and manual methods await the admin's confirmation
  assert.equal(count({ booking_status: 'pending_confirmation', payment_method_key: 'pay-on-day', payment_status: 'not_required_yet' }), 1);
  // PayPal awaiting the customer's payment cannot be confirmed yet...
  assert.equal(count({ booking_status: 'pending_payment', payment_method_key: 'paypal', payment_status: 'pending' }), 0);
  assert.equal(count({ booking_status: 'pending_payment', payment_method_key: 'paypal', payment_status: 'processing' }), 0);
  // ...but once PayPal paid it, it is waiting for the admin (the old rule dropped every PayPal booking).
  assert.equal(count({ booking_status: 'pending_confirmation', payment_method_key: 'paypal', payment_status: 'paid' }), 1);
});

test('rows repeated across pages count once', () => {
  const { computeDashboardKpis } = metrics();
  const paid = booking({ payment_status: 'paid', total_snapshot: 120 });
  const result = computeDashboardKpis([paid, { ...paid }, booking()]);
  assert.equal(result.totalReservations, 2);
  assert.equal(result.revenue, 120);
});

test('loadAllPages reads every 1000-row page until a short page', async () => {
  const { loadAllPages } = metrics();
  const ranges = [];
  const rows = await loadAllPages(async (from, to) => { ranges.push([from, to]); return from >= 2000 ? Array.from({ length: 5 }, (_, i) => i) : Array.from({ length: 1000 }, (_, i) => i); });
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(rows.length, 2005);
});

// ---- data flow: service -> PostgREST requests -> KPIs ---------------------------------------------------------

function service(respond) {
  const requests = [];
  const client = createClient('https://admin-test.supabase.co', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      const request = { url: new URL(url), method: init?.method ?? 'GET', headers: new Headers(init?.headers) };
      requests.push(request);
      return respond(request);
    } },
  });
  const m = metrics();
  const context = vm.createContext({
    supabase: client, Error, Number, Math, Set, Array,
    readWithAdminSession: async (query) => { const response = await query(); if (response.error) throw new Error(response.error.message); return response.data; },
    computeDashboardKpis: m.computeDashboardKpis, loadAllPages: m.loadAllPages,
  });
  load('src/services/adminDashboardService.ts', context);
  return { context, requests };
}

const json = (body, headers = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } });

test('KPI scan asks for statuses + paid payments in one embedded query, pages through 1000-row batches and computes every KPI', async () => {
  const page1 = Array.from({ length: 1000 }, (_, i) => booking({ id: `p1-${i}`, payment_status: i < 10 ? 'paid' : 'pending', total_snapshot: 10 }));
  const page2 = [
    booking({ id: 'p2-0', payment_status: 'paid', payment_method_key: 'paypal', booking_status: 'confirmed', total_snapshot: 999, payments: [{ amount: 500, status: 'paid' }] }),
    booking({ id: 'p2-1', payment_status: 'processing', payment_method_key: 'paypal', booking_status: 'pending_payment' }),
  ];
  const { context, requests } = service((request) => {
    return json(request.url.searchParams.get('offset') === '0' ? page1 : page2);
  });
  const kpis = await context.fetchDashboardKpis();

  assert.equal(requests.length, 2, 'one request per 1000-row page, no per-booking requests');
  for (const request of requests) {
    assert.equal(request.url.pathname, '/rest/v1/bookings');
    assert.equal(request.url.searchParams.get('select'), 'id,payment_status,booking_status,payment_method_key,total_snapshot,payments(amount,status)');
    assert.equal(request.url.searchParams.get('payments.status'), 'eq.paid');
    assert.equal(request.url.searchParams.get('order'), 'id.asc');
  }
  assert.deepEqual(requests.map((request) => [request.url.searchParams.get('offset'), request.url.searchParams.get('limit')]), [['0', '1000'], ['1000', '1000']]);

  assert.equal(kpis.totalReservations, 1002);
  assert.equal(kpis.confirmedPayments, 11);
  assert.equal(kpis.revenue, 10 * 10 + 500);
  assert.equal(kpis.pendingPayments, 990 + 1);
  // 990 whatsapp pending_payment rows; the PayPal processing one is excluded.
  assert.equal(kpis.reservationsToConfirm, 1000);
});

test('KPI scan surfaces a failed query instead of returning zeros', async () => {
  const { context } = service(() => new Response(JSON.stringify({ message: 'boom', code: 'TEST' }), { status: 500, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(() => context.fetchDashboardKpis(), /boom/);
});

test('recent reservations fetch only the 8 newest rows, not the whole table', async () => {
  const { context, requests } = service(() => json([{ id: 'r1' }]));
  const rows = await context.fetchRecentReservations(8);
  assert.equal(rows.length, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get('limit'), '8');
  assert.equal(requests[0].url.searchParams.get('order'), 'created_at.desc');
});

test('pending reviews use an exact head count of status = pending', async () => {
  const { context, requests } = service(() => new Response(null, { headers: { 'content-range': '*/7' } }));
  assert.equal(await context.fetchPendingReviewsCount(), 7);
  assert.equal(requests[0].method, 'HEAD');
  assert.equal(requests[0].url.pathname, '/rest/v1/reviews');
  assert.equal(requests[0].url.searchParams.get('status'), 'eq.pending');
  assert.match(requests[0].headers.get('prefer') ?? '', /count=exact/);
});

test('pending reviews error is thrown, not shown as 0', async () => {
  const { context } = service(() => new Response(JSON.stringify({ message: 'denied' }), { status: 403, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(() => context.fetchPendingReviewsCount(), /denied/);
});

test('the Dashboard page no longer hardcodes revenue or derives KPIs from the recent-rows list', () => {
  const page = fs.readFileSync('src/pages/admin/AdminDashboardPage.tsx', 'utf8');
  assert.doesNotMatch(page, /estimatedRevenue/);
  assert.doesNotMatch(page, /money\(\s*0\s*\)/);
  assert.match(page, /money\(value\.revenue\)/);
  assert.doesNotMatch(page, /reservations\.filter/);
  assert.doesNotMatch(page, /String\(reservations\.length\)/);
});

test('every Dashboard query takes part in the error alert, Reintentar and the 30s refresh', () => {
  const page = fs.readFileSync('src/pages/admin/AdminDashboardPage.tsx', 'utf8');
  for (const query of ['pendingReviewsQuery', 'kpisQuery', 'reservationsQuery']) {
    assert.match(page, new RegExp(`${query}\.isError`), `${query} must feed the alert`);
    assert.match(page, new RegExp(`void ${query}\.refetch\(\)`), `${query} must be retried by Reintentar`);
  }
  assert.equal((page.match(/refetchInterval: 30_000/g) ?? []).length, 3);
  assert.doesNotMatch(page, /No se pudieron cargar las reservas/);
});
