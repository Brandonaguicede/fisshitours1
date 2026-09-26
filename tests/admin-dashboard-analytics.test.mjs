// Dashboard analytics + "Reservas recientes": query (PostgREST rows) -> transformation (src/utils/dashboardMetrics.ts)
// -> the exact datasets each chart draws. Node only; the browser side is admin-dashboard-overview.test.mjs.
//
// Reference clock for every test: Wed 2026-09-23 09:00 Costa Rica (UTC-6) = 15:00Z, so the current calendar week is
// Mon 2026-09-21 - Sun 2026-09-27 and the 12-week window is Mon 2026-07-06 - Sun 2026-09-27.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import { loadDashboardMetrics, loadTs, plain } from './support/load-ts.mjs';

const NOW = new Date('2026-09-23T15:00:00Z');
const metrics = loadDashboardMetrics();

let seq = 0;
const booking = (overrides = {}) => ({
  id: `b-${String(++seq).padStart(4, '0')}`,
  created_at: '2026-09-22T12:00:00Z',
  tour_date: '2026-10-05',
  boat_id: 'boat-a',
  tour_id: 'tour-x',
  payment_status: 'pending',
  booking_status: 'pending_payment',
  payment_method_key: 'whatsapp-link',
  total_snapshot: 100,
  payments: [],
  customers: { full_name: 'Cliente' },
  boats: { name: 'Boat A' },
  tours: { title: 'Tour X' },
  payment_methods: { name: 'WhatsApp link' },
  ...overrides,
});

const analytics = (rows, now = NOW) => plain(metrics.computeDashboardAnalytics(rows, now));

test('the period is the last 12 calendar weeks (Mon-Sun, Costa Rica clock) including the current one', () => {
  const result = analytics([]);
  assert.deepEqual(result.period, { weeks: 12, start: '2026-07-06', end: '2026-09-27' });
  assert.equal(result.weeklyBookings.length, 12);
  assert.equal(result.weeklyBookings[0].start, '2026-07-06');
  assert.equal(result.weeklyBookings[11].start, '2026-09-21');
  assert.equal(result.weeklyBookings[11].end, '2026-09-27');
  // consecutive Mondays, every week Monday -> Sunday
  result.weeklyBookings.forEach((week, index) => {
    assert.equal(new Date(`${week.start}T00:00:00Z`).getUTCDay(), 1, `${week.start} is a Monday`);
    assert.equal((new Date(`${week.end}T00:00:00Z`) - new Date(`${week.start}T00:00:00Z`)) / 86_400_000, 6);
    if (index) assert.equal((new Date(`${week.start}T00:00:00Z`) - new Date(`${result.weeklyBookings[index - 1].start}T00:00:00Z`)) / 86_400_000, 7);
  });
});

test('"now" on the boundary of a week follows the Costa Rica clock, not UTC', () => {
  // Sun 2026-09-27 23:30 CR = Mon 2026-09-28 05:30Z -> still the week of Sep 21
  assert.equal(analytics([], new Date('2026-09-28T05:30:00Z')).period.end, '2026-09-27');
  // Mon 2026-09-28 00:00 CR = 06:00Z -> a new week starts, the window slides by one
  const next = analytics([], new Date('2026-09-28T06:00:00Z'));
  assert.deepEqual(next.period, { weeks: 12, start: '2026-07-13', end: '2026-10-04' });
});

test('window edges: first instant in, last instant in, one second before / after out', () => {
  const rows = [
    booking({ created_at: '2026-07-05T23:59:59-06:00' }), // Sun Jul 5 CR: previous week, outside
    booking({ created_at: '2026-07-06T00:00:00-06:00' }), // Mon Jul 6 00:00 CR: first instant of week 1
    booking({ created_at: '2026-09-27T23:59:59-06:00' }), // Sun Sep 27 23:59:59 CR: last instant of week 12
    booking({ created_at: '2026-09-28T00:00:00-06:00' }), // Mon Sep 28 CR: next week, outside
    booking({ created_at: 'not a date' }), // unusable, never invented into a week
    booking({ created_at: null }),
  ];
  const result = analytics(rows);
  assert.equal(result.total, 2);
  assert.deepEqual(result.weeklyBookings.map((week) => week.count), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
});

test('cancelled bookings are excluded from every analytic; other statuses are counted', () => {
  const rows = [
    booking({ booking_status: 'cancelled', boat_id: 'boat-z', boats: { name: 'Solo cancelada' }, payment_method_key: 'paypal' }),
    ...['pending', 'pending_payment', 'pending_confirmation', 'confirmed', 'completed'].map((booking_status) => booking({ booking_status })),
  ];
  const result = analytics(rows);
  assert.equal(result.total, 5);
  assert.equal(result.weeklyBookings.reduce((sum, week) => sum + week.count, 0), 5);
  assert.deepEqual(result.demandByBoat.map((item) => item.label), ['Boat A']); // 'Solo cancelada' never appears
  assert.equal(result.paymentMethods.some((item) => item.id === 'paypal'), false);
});

test('demand by boat / tour: names, counts, ordering and ties', () => {
  const b = (boat_id, name, tour_id, title) => booking({ boat_id, boats: { name }, tour_id, tours: { title } });
  const rows = [
    b('b1', 'Zeta', 't1', 'Snorkel'), b('b1', 'Zeta', 't1', 'Snorkel'), b('b1', 'Zeta', 't2', 'Pesca'),
    b('b2', 'Alfa', 't1', 'Snorkel'), b('b2', 'Alfa', 't2', 'Pesca'), b('b2', 'Alfa', 't2', 'Pesca'),
    b('b3', 'Media', 't3', 'Atardecer'),
    // two boats with the same name stay two rows (grouped by id, labelled by name)
    b('b4', 'Media', 't3', 'Atardecer'),
    // names that did not come back from the join fall back to the real id
    booking({ boat_id: 'b5', boats: null, tour_id: 't9', tours: null }),
  ];
  const result = analytics(rows);
  // Count desc; ties alphabetical (es): Alfa 3 / Zeta 3, then the three singles b5 < Media < Media (same label -> by id).
  assert.deepEqual(result.demandByBoat.map((item) => [item.id, item.label, item.count]), [
    ['b2', 'Alfa', 3], ['b1', 'Zeta', 3], ['b5', 'b5', 1], ['b3', 'Media', 1], ['b4', 'Media', 1],
  ]);
  assert.deepEqual(result.demandByTour.map((item) => [item.label, item.count]), [['Pesca', 3], ['Snorkel', 3], ['Atardecer', 2], ['t9', 1]]);
});

test('more than six boats/tours: top six plus an honest "Otros (n)" total', () => {
  const rows = [];
  // 8 boats with 8,7,...,1 bookings
  for (let boat = 1; boat <= 8; boat += 1) for (let i = 0; i < 9 - boat; i += 1) rows.push(booking({ boat_id: `b${boat}`, boats: { name: `Bote ${boat}` } }));
  const result = analytics(rows);
  assert.equal(result.demandByBoat.length, 7);
  assert.deepEqual(result.demandByBoat.slice(0, 6).map((item) => item.count), [8, 7, 6, 5, 4, 3]);
  assert.deepEqual(result.demandByBoat[6], { id: '__others', label: 'Otros (2)', count: 2 + 1 });
  assert.equal(result.demandByBoat.reduce((sum, item) => sum + item.count, 0), result.total);
});

test('payment methods: labels, counts, percentages and the explicit most-used method', () => {
  const m = (key, name) => booking({ payment_method_key: key, payment_methods: { name } });
  const rows = [m('paypal', 'PayPal'), m('paypal', 'PayPal'), m('paypal', 'PayPal'), m('whatsapp-link', 'Pago por WhatsApp'), m('whatsapp-link', 'Pago por WhatsApp'), m('pay-on-day', 'Pagar el día del tour'), m('sinpe', 'SINPE Móvil')];
  const result = analytics(rows);
  assert.deepEqual(result.paymentMethods.map((item) => [item.label, item.count, item.percent]), [
    ['PayPal', 3, 43], // 3/7 = 42.86 -> 43
    ['WhatsApp', 2, 29], // 2/7 = 28.57 -> 29
    ['Día del tour', 1, 14], // 1/7 = 14.29 -> 14
    ['SINPE Móvil', 1, 14],
  ]);
  assert.deepEqual(result.mostUsedPaymentMethod, { labels: ['PayPal'], count: 3, percent: 43 });
});

test('payment methods: a tie for first place lists every tied method, alphabetically', () => {
  const m = (key, name) => booking({ payment_method_key: key, payment_methods: { name } });
  const result = analytics([m('paypal', 'PayPal'), m('whatsapp-link', 'WhatsApp'), m('paypal', 'PayPal'), m('whatsapp-link', 'WhatsApp'), m('sinpe', 'SINPE')]);
  assert.deepEqual(result.mostUsedPaymentMethod, { labels: ['PayPal', 'WhatsApp'], count: 2, percent: 40 });
});

test('weekly bookings: same population as the other charts, quiet weeks kept as zero', () => {
  const at = (created_at, overrides) => booking({ created_at, ...overrides });
  const rows = [
    at('2026-07-08T12:00:00Z'), at('2026-07-09T12:00:00Z'), // week 1 (Jul 6)
    at('2026-08-01T05:59:00Z'), // Fri Jul 31 23:59 CR -> week of Jul 27 (index 3)
    at('2026-08-01T06:00:00Z'), // Sat Aug 1 00:00 CR -> still week of Jul 27 (index 3)
    at('2026-08-03T06:00:00Z'), // Mon Aug 3 00:00 CR -> week of Aug 3 (index 4)
    at('2026-09-23T14:00:00Z'), at('2026-09-22T14:00:00Z'), at('2026-09-21T06:00:00Z'), // current week (index 11)
    at('2026-09-10T12:00:00Z', { booking_status: 'cancelled' }), // excluded
    at('2026-06-30T12:00:00Z'), // before the window
  ];
  const result = analytics(rows);
  assert.deepEqual(result.weeklyBookings.map((week) => week.count), [2, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 3]);
  assert.equal(result.total, 8);
  // Every chart is built from the same 8 bookings.
  for (const dataset of [result.demandByBoat, result.demandByTour, result.paymentMethods]) assert.equal(dataset.reduce((sum, item) => sum + item.count, 0), 8);
});

test('empty states: no bookings, only cancelled, or only outside the window all leave every dataset empty', () => {
  for (const rows of [[], [booking({ booking_status: 'cancelled' })], [booking({ created_at: '2026-01-15T12:00:00Z' })]]) {
    const result = analytics(rows);
    assert.equal(result.total, 0);
    assert.deepEqual(result.demandByBoat, []);
    assert.deepEqual(result.demandByTour, []);
    assert.deepEqual(result.paymentMethods, []);
    assert.equal(result.mostUsedPaymentMethod, null);
    assert.equal(result.weeklyBookings.every((week) => week.count === 0), true);
  }
  assert.equal(metrics.EMPTY_TREND_MESSAGE, 'Aún no hay suficientes reservas para mostrar esta tendencia.');
});

test('recent reservations: exactly the 5 newest by created_at, with only customer, tour date and payment status', () => {
  const rows = [
    booking({ id: 'a', created_at: '2026-09-01T10:00:00Z' }),
    booking({ id: 'b', created_at: '2026-09-05T10:00:00Z', customers: { full_name: 'Ana' }, tour_date: '2026-11-02', payment_status: 'paid' }),
    booking({ id: 'c', created_at: '2026-09-05T10:00:00Z', customers: { full_name: 'Beto' } }), // same instant as b: larger id first
    booking({ id: 'd', created_at: '2026-08-01T10:00:00Z' }),
    booking({ id: 'e', created_at: '2026-09-20T10:00:00Z', booking_status: 'cancelled' }), // cancelled bookings are still the latest requests
    booking({ id: 'f', created_at: '2026-09-03T10:00:00Z', customers: null }),
    booking({ id: 'g', created_at: '2026-07-01T10:00:00Z' }),
  ];
  const recent = plain(metrics.selectRecentReservations(rows));
  assert.deepEqual(recent.map((row) => row.id), ['e', 'c', 'b', 'f', 'a']);
  assert.deepEqual(Object.keys(recent[0]).sort(), ['customerName', 'id', 'paymentStatus', 'tourDate']);
  assert.deepEqual(recent[2], { id: 'b', customerName: 'Ana', tourDate: '2026-11-02', paymentStatus: 'paid' });
  assert.equal(recent[3].customerName, null);
  assert.equal(plain(metrics.selectRecentReservations(rows.slice(0, 3))).length, 3); // fewer than five -> only what exists
});

test('overview: KPIs keep counting every booking while analytics only count the window', () => {
  const rows = [
    booking({ booking_status: 'cancelled', payment_status: 'failed' }),
    booking({ created_at: '2025-12-01T12:00:00Z', payment_status: 'paid', booking_status: 'completed', total_snapshot: 300 }),
    booking({ payment_status: 'paid', booking_status: 'confirmed', total_snapshot: 200 }),
  ];
  const overview = plain(metrics.buildDashboardOverview([...rows, { ...rows[2] }], NOW));
  assert.equal(overview.kpis.totalReservations, 3); // 3 distinct rows, cancelled and old ones included, the repeated one once
  assert.equal(overview.kpis.revenue, 500);
  assert.equal(overview.analytics.total, 1);
  assert.equal(overview.recentReservations.length, 3);
});

// ---- data flow: PostgREST pages -> fetchDashboardOverview -> every dataset ---------------------------------------

function service(respond) {
  const requests = [];
  const client = createClient('https://admin-test.supabase.co', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => { const request = { url: new URL(url), method: init?.method ?? 'GET' }; requests.push(request); return respond(request); } },
  });
  const context = vm.createContext({
    supabase: client, Error,
    readWithAdminSession: async (query) => { const response = await query(); if (response.error) throw new Error(response.error.message); return response.data; },
    buildDashboardOverview: metrics.buildDashboardOverview, loadAllPages: metrics.loadAllPages,
  });
  loadTs('src/services/adminDashboardService.ts', context);
  return { context, requests };
}

const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('one relational, paginated overview query: no N+1, no second fetch, every chart from the same rows', async () => {
  // Page 1: 1000 rows, all the same boat/tour/method, created in the week of Aug 3 (index 4).
  const page1 = Array.from({ length: 1000 }, (_, i) => booking({ id: `p1-${String(i).padStart(4, '0')}`, created_at: '2026-08-05T12:00:00Z', payment_status: 'paid', booking_status: 'confirmed', payment_method_key: 'paypal', payment_methods: { name: 'PayPal' }, total_snapshot: 10 }));
  // Page 2: short page (ends the scan) with the varied rows.
  const page2 = [
    booking({ id: 'p2-a', created_at: '2026-09-22T13:00:00Z', boat_id: 'boat-b', boats: { name: 'Boat B' }, tour_id: 'tour-y', tours: { title: 'Tour Y' }, customers: { full_name: 'Newest' } }),
    booking({ id: 'p2-b', created_at: '2026-09-21T13:00:00Z', boat_id: 'boat-b', boats: { name: 'Boat B' }, booking_status: 'cancelled', customers: { full_name: 'Cancelled but recent' } }),
    booking({ id: 'p2-c', created_at: '2026-05-01T13:00:00Z', customers: { full_name: 'Too old for the window' } }),
    booking({ id: 'p2-d', created_at: '2026-09-15T13:00:00Z', boat_id: 'boat-b', boats: { name: 'Boat B' }, payment_method_key: 'whatsapp-link', customers: { full_name: 'Week 10' } }),
  ];
  const { context, requests } = service((request) => json(request.url.searchParams.get('offset') === '0' ? page1 : page2));
  const overview = plain(await context.fetchDashboardOverview(NOW));

  // Query shape: 2 requests = 2 pages of max_rows 1000, all on `bookings`, every relation embedded in that same select.
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((request) => request.url.pathname), ['/rest/v1/bookings', '/rest/v1/bookings']);
  assert.deepEqual(requests.map((request) => [request.url.searchParams.get('offset'), request.url.searchParams.get('limit')]), [['0', '1000'], ['1000', '1000']]);
  const select = requests[0].url.searchParams.get('select');
  for (const relation of ['customers(full_name)', 'boats(name)', 'tours(title)', 'payment_methods(name)', 'payments(amount,status)']) assert.ok(select.includes(relation), relation);
  assert.equal(new Set(requests.map((request) => request.url.search.replace(/offset=\d+/, ''))).size, 1, 'both pages are the same query, only the range moves');

  // Transformation, checked by hand: 1000 + p2-a + p2-b + p2-c + p2-d rows in total.
  assert.equal(overview.kpis.totalReservations, 1004);
  assert.equal(overview.kpis.confirmedPayments, 1000);
  assert.equal(overview.kpis.revenue, 10_000);
  assert.equal(overview.analytics.total, 1002); // 1000 + p2-a + p2-d; p2-b cancelled, p2-c outside the window
  assert.deepEqual(overview.analytics.demandByBoat.map((item) => [item.label, item.count]), [['Boat A', 1000], ['Boat B', 2]]);
  assert.deepEqual(overview.analytics.demandByTour.map((item) => [item.label, item.count]), [['Tour X', 1001], ['Tour Y', 1]]);
  assert.deepEqual(overview.analytics.weeklyBookings.map((week) => week.count), [0, 0, 0, 0, 1000, 0, 0, 0, 0, 0, 1, 1]);
  assert.deepEqual(overview.analytics.paymentMethods.map((item) => [item.label, item.count, item.percent]), [['PayPal', 1000, 100], ['WhatsApp', 2, 0]]);
  assert.deepEqual(overview.analytics.mostUsedPaymentMethod, { labels: ['PayPal'], count: 1000, percent: 100 });
  // Newest three, then the two page-1 rows that share one created_at (larger id first): the latest five across both pages.
  assert.deepEqual(overview.recentReservations.map((row) => row.id), ['p2-a', 'p2-b', 'p2-d', 'p1-0999', 'p1-0998']);
  assert.deepEqual(overview.recentReservations.map((row) => row.customerName), ['Newest', 'Cancelled but recent', 'Week 10', 'Cliente', 'Cliente']);
});

test('the Dashboard page fetches the overview once and does not derive anything a second time', () => {
  const page = fs.readFileSync('src/pages/admin/AdminDashboardPage.tsx', 'utf8');
  assert.equal((page.match(/useQuery\(/g) ?? []).length, 2, 'overview + pending reviews, nothing else');
  assert.equal((page.match(/fetchDashboardOverview/g) ?? []).length, 2, 'one import, one call');
  assert.doesNotMatch(page, /fetchDashboardKpis|fetchRecentReservations|computeDashboard|loadAllPages/);
  assert.equal((page.match(/dashboardOverview/g) ?? []).length, 2, 'the realtime invalidation targets the one overview key');
  const service = fs.readFileSync('src/services/adminDashboardService.ts', 'utf8');
  assert.equal((service.match(/\.from\('bookings'\)/g) ?? []).length, 1, 'a single scan of bookings in the service');
});
