// BAC Credomatic card payments: the five basic methods BAC certifies (Sale, Authorize, Capture, Void, Refund),
// tested on the real migrations (PGlite), the gateway helpers and both Edge Functions (network/Supabase doubles).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { loadTs, plain } from './support/load-ts.mjs';
import { handleCancelBookingRequest } from '../supabase/functions/_shared/booking-cancel.mjs';

const migrations = [
  'supabase/migrations/202610280001_bac_card_payments.sql',
  'supabase/migrations/202610290001_bac_basic_methods.sql',
].map((file) => fs.readFileSync(file, 'utf8'));

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table payment_methods (key text primary key, name text not null, description text, description_en text, description_es text,
      type text not null constraint payment_methods_type_check check (type in ('paypal','whatsapp_link')),
      active boolean not null default true, instructions text, logo_url text, sort_order int not null default 0);
    insert into payment_methods (key, name, type) values ('paypal','PayPal','paypal'), ('whatsapp-link','WhatsApp','whatsapp_link');
    create table bookings (id uuid primary key default gen_random_uuid(), booking_reference text not null, payment_method_key text not null,
      payment_status text not null constraint bookings_payment_status_check check (payment_status in ('pending','processing','paid','failed','refunded')),
      booking_status text not null, currency text not null default 'USD',
      total_snapshot numeric(10,2) not null, tax_amount_snapshot numeric(10,2) not null default 0, expires_at timestamptz);
    create table payments (id uuid primary key default gen_random_uuid(), booking_id uuid not null references bookings(id),
      provider text not null constraint payments_provider_check check (provider in ('paypal','manual','whatsapp')),
      provider_order_id text, provider_capture_id text, amount numeric(10,2) not null, currency text not null,
      status text not null constraint payments_status_check check (status in ('pending','processing','paid','failed','cancelled','refunded')),
      raw_response jsonb, created_at timestamptz default clock_timestamp(), updated_at timestamptz default now());
    create table booking_status_history (booking_id uuid, previous_booking_status text, new_booking_status text,
      previous_payment_status text, new_payment_status text, note text);
    create table availability_blocks (booking_id uuid, source text, active boolean);
  `);
  for (const sql of migrations) await db.exec(sql);
  return db;
}

async function insertCardBooking(db, reference = 'PFT-CARD0001') {
  const { rows } = await db.query(`insert into bookings (booking_reference, payment_method_key, payment_status, booking_status, total_snapshot, tax_amount_snapshot)
    values ($1, 'bac-card', 'pending', 'pending_payment', 791, 91) returning *`, [reference]);
  await db.query(`insert into availability_blocks values ($1, 'booking', true)`, [rows[0].id]);
  return rows[0];
}

const rpcError = async (promise) => {
  try { await promise; } catch (error) { return error; }
  assert.fail('expected the call to raise');
};

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const bookingState = (db, id) => one(db, 'select payment_status, booking_status from bookings where id = $1', [id]);

/** Customer checkout through the RPCs, as bac-process-payment runs them. */
async function checkout(db, booking, type = 'sale', approved = true) {
  const attempt = (await one(db, 'select begin_bac_payment_attempt($1, 3, $2) as r', [booking.id, type])).r;
  await db.query(`select complete_bac_payment_attempt($1, $2, $3, 791, 'USD', 'note', '{}'::jsonb)`, [attempt.attempt_id, approved, `GW-${type}-1`]);
  return attempt;
}

/** Admin operation through the RPCs, as admin-bac-transaction runs them. */
async function adminOperation(db, booking, operation, { amount = null, approved = true } = {}) {
  const started = (await one(db, 'select begin_bac_admin_operation($1, $2, $3, null) as r', [booking.id, operation, amount])).r;
  return (await one(db, `select complete_bac_admin_operation($1, $2, $3, 'note', '{}'::jsonb) as r`, [started.operation_id, approved, `GW-${operation}`])).r;
}

test('card method is seeded inactive and card bookings get a payment hold', async () => {
  const db = await createDatabase();
  try {
    assert.deepEqual(await one(db, `select type, active from payment_methods where key = 'bac-card'`), { type: 'card', active: false });
    const booking = await insertCardBooking(db);
    assert.ok(booking.expires_at, 'card bookings must expire like PayPal holds');
    const other = await one(db, `insert into bookings (booking_reference, payment_method_key, payment_status, booking_status, total_snapshot)
      values ('PFT-WA', 'whatsapp-link', 'pending', 'pending_payment', 100) returning expires_at`);
    assert.equal(other.expires_at, null);
  } finally { await db.close(); }
});

test('SALE: attempts are serialized, capped and only an exact amount confirms the booking', async () => {
  const db = await createDatabase();
  try {
    const booking = await insertCardBooking(db);
    const begin = async () => (await one(db, 'select begin_bac_payment_attempt($1, 3) as r', [booking.id])).r;
    const complete = (attemptId, approved, amount = 791) => db.query(
      `select complete_bac_payment_attempt($1, $2, 'TX-1', $3, 'USD', 'note', '{}'::jsonb) as r`, [attemptId, approved, amount]);

    const first = await begin();
    assert.equal(first.transaction_type, 'sale');
    assert.equal(Number(first.amount), 791);
    assert.equal(Number(first.tax_amount), 91);
    assert.equal((await rpcError(begin())).code, '55P03', 'a second concurrent charge must be refused');

    await complete(first.attempt_id, false);
    assert.equal((await bookingState(db, booking.id)).payment_status, 'pending');
    assert.match((await rpcError(complete(first.attempt_id, true))).message, /already settled/);

    const second = await begin();
    assert.match((await rpcError(complete(second.attempt_id, true, 1))).message, /does not match/);
    await complete(second.attempt_id, true);
    assert.deepEqual(await bookingState(db, booking.id), { payment_status: 'paid', booking_status: 'confirmed' });
    assert.match((await rpcError(begin())).message, /not ready/);

    const capped = await insertCardBooking(db, 'PFT-CAP');
    for (let index = 0; index < 3; index += 1) await checkout(db, capped, 'sale', false);
    assert.equal((await rpcError(db.query('select begin_bac_payment_attempt($1, 3)', [capped.id]))).code, '54000');
  } finally { await db.close(); }
});

test('AUTHORIZE + CAPTURE: the hold confirms nothing until an admin captures the full amount', async () => {
  const db = await createDatabase();
  try {
    const booking = await insertCardBooking(db);
    await checkout(db, booking, 'auth');
    assert.deepEqual(await bookingState(db, booking.id), { payment_status: 'authorized', booking_status: 'pending_confirmation' });
    assert.equal((await one(db, `select status from payments where transaction_type = 'auth'`)).status, 'authorized');

    assert.match((await rpcError(adminOperation(db, booking, 'refund'))).message, /no settled card payment/);
    assert.match((await rpcError(adminOperation(db, booking, 'capture', { amount: 100 }))).message, /full authorized amount/);
    const declined = await adminOperation(db, booking, 'capture', { approved: false });
    assert.equal(declined.payment_status, 'authorized');

    const captured = await adminOperation(db, booking, 'capture');
    assert.equal(captured.payment_status, 'paid');
    assert.equal(captured.booking_status, 'confirmed');
    const capture = await one(db, `select status, amount, parent_payment_id is not null as linked from payments where transaction_type = 'capture' and status = 'paid'`);
    assert.deepEqual({ ...capture, amount: Number(capture.amount) }, { status: 'paid', amount: 791, linked: true });
    assert.match((await rpcError(adminOperation(db, booking, 'capture'))).message, /no authorization/);
  } finally { await db.close(); }
});

test('VOID: cancels an authorization or an unsettled sale, releases the slot and blocks refunded sales', async () => {
  const db = await createDatabase();
  try {
    const held = await insertCardBooking(db, 'PFT-AUTH');
    await checkout(db, held, 'auth');
    const voided = await adminOperation(db, held, 'void');
    assert.deepEqual({ payment_status: voided.payment_status, booking_status: voided.booking_status }, { payment_status: 'voided', booking_status: 'cancelled' });
    assert.equal((await one(db, `select status from payments where booking_id = $1 and transaction_type = 'auth'`, [held.id])).status, 'cancelled');
    assert.equal((await one(db, 'select active from availability_blocks where booking_id = $1', [held.id])).active, false);

    const sold = await insertCardBooking(db, 'PFT-SALE');
    await checkout(db, sold, 'sale');
    assert.equal((await adminOperation(db, sold, 'void')).payment_status, 'voided');

    const refunded = await insertCardBooking(db, 'PFT-REF');
    await checkout(db, refunded, 'sale');
    await adminOperation(db, refunded, 'refund', { amount: 10 });
    assert.match((await rpcError(adminOperation(db, refunded, 'void'))).message, /refunded transaction cannot be voided/);
  } finally { await db.close(); }
});

test('REFUND: partial refunds accumulate up to the charged amount, then the booking is refunded', async () => {
  const db = await createDatabase();
  try {
    const booking = await insertCardBooking(db);
    await checkout(db, booking, 'sale');
    const partial = await adminOperation(db, booking, 'refund', { amount: 237.3 });
    assert.equal(partial.payment_status, 'paid', 'a partial refund keeps the booking paid');
    assert.match((await rpcError(adminOperation(db, booking, 'refund', { amount: 553.71 }))).message, /between 0.01 and 553.70/);
    assert.match((await rpcError(adminOperation(db, booking, 'refund', { amount: 0.001 }))).message, /between/);
    const rest = await adminOperation(db, booking, 'refund');
    assert.equal(Number(rest.amount), 553.7, 'no amount refunds the remaining balance');
    assert.equal(rest.payment_status, 'refunded');
    assert.match((await rpcError(adminOperation(db, booking, 'refund', { amount: 1 }))).message, /no settled card payment/);
  } finally { await db.close(); }
});

test('admin operations are serialized per booking and never touch non-card bookings', async () => {
  const db = await createDatabase();
  try {
    const booking = await insertCardBooking(db);
    await checkout(db, booking, 'sale');
    await db.query('select begin_bac_admin_operation($1, $2, $3, null)', [booking.id, 'refund', 5]);
    assert.equal((await rpcError(db.query('select begin_bac_admin_operation($1, $2, $3, null)', [booking.id, 'void', null]))).code, '55P03');
    const whatsapp = await one(db, `insert into bookings (booking_reference, payment_method_key, payment_status, booking_status, total_snapshot)
      values ('PFT-WA', 'whatsapp-link', 'paid', 'confirmed', 100) returning id`);
    assert.match((await rpcError(db.query(`select begin_bac_admin_operation($1, 'refund', 1, null)`, [whatsapp.id]))).message, /not card/);
    assert.match((await rpcError(db.query(`select begin_bac_admin_operation($1, 'credit', null, null)`, [booking.id]))).message, /invalid card operation/);
  } finally { await db.close(); }
});

test('expired pending card holds are released, in-flight and authorized ones are kept', async () => {
  const db = await createDatabase();
  try {
    const abandoned = await insertCardBooking(db, 'PFT-OLD');
    const inFlight = await insertCardBooking(db, 'PFT-FLY');
    const authorized = await insertCardBooking(db, 'PFT-HOLD');
    await db.query('select begin_bac_payment_attempt($1, 3)', [inFlight.id]);
    await checkout(db, authorized, 'auth');
    await db.exec(`update bookings set expires_at = now() - interval '1 minute'`);
    assert.equal((await one(db, 'select expire_pending_bac_bookings() as n')).n, 1);
    const rows = (await db.query('select booking_reference, booking_status, payment_status from bookings order by booking_reference')).rows;
    assert.deepEqual(rows, [
      { booking_reference: 'PFT-FLY', booking_status: 'pending_payment', payment_status: 'processing' },
      { booking_reference: 'PFT-HOLD', booking_status: 'pending_confirmation', payment_status: 'authorized' },
      { booking_reference: 'PFT-OLD', booking_status: 'cancelled', payment_status: 'failed' },
    ]);
    assert.equal((await one(db, 'select active from availability_blocks where booking_id = $1', [abandoned.id])).active, false);
  } finally { await db.close(); }
});

test('RPCs are not executable by browser roles', async () => {
  const db = await createDatabase();
  try {
    const row = await one(db, `select has_function_privilege('anon', 'begin_bac_payment_attempt(uuid,int,text)', 'execute') as anon,
      has_function_privilege('authenticated', 'complete_bac_payment_attempt(uuid,boolean,text,numeric,text,text,jsonb)', 'execute') as auth,
      has_function_privilege('authenticated', 'begin_bac_admin_operation(uuid,text,numeric,uuid)', 'execute') as admin_begin,
      has_function_privilege('anon', 'complete_bac_admin_operation(uuid,boolean,text,text,jsonb)', 'execute') as admin_complete,
      has_function_privilege('service_role', 'begin_bac_admin_operation(uuid,text,numeric,uuid)', 'execute') as service`);
    assert.deepEqual(row, { anon: false, auth: false, admin_begin: false, admin_complete: false, service: true });
  } finally { await db.close(); }
});

function loadGateway(env = {}) {
  return loadTs('supabase/functions/_shared/bac-gateway.ts', vm.createContext({ URLSearchParams, Deno: { env: { get: (key) => env[key] } } }));
}

const validThreeDs = { cavv: 'AAABBEg0VhI0VniQEjRWAAAAAAA=', eci: '05', cardHolderAuth: 'verified', threeDsVersion: '2.2.0', directoryServerId: 'c3f0f4a6-8f1b-4c5e-9b1a-2d3e4f5a6b7c' };

test('3-D Secure data is mandatory and strictly shaped', () => {
  const gateway = loadGateway();
  assert.deepEqual(plain(gateway.validateThreeDSecure(validThreeDs)), validThreeDs);
  assert.equal(gateway.validateThreeDSecure({ ...validThreeDs, cavv: '' }), null);
  assert.equal(gateway.validateThreeDSecure({ ...validThreeDs, cardHolderAuth: 'failed' }), null);
  assert.equal(gateway.validateThreeDSecure({ ...validThreeDs, threeDsVersion: '1.0.2' }), null);
  assert.equal(gateway.validateThreeDSecure({ ...validThreeDs, cavv: 'x&amount=1' }), null);
  assert.equal(gateway.validateThreeDSecure(null), null);
});

test('sale/auth requests carry server amounts and 3DS values; response parsing is fail-closed', () => {
  const gateway = loadGateway({ BAC_GATEWAY_URL: 'https://gateway.example.com/' });
  const saleInput = { type: 'sale', securityKey: 'secret', paymentToken: 'tok_1', amount: '791.00', taxAmount: '91.00', currency: 'USD',
    orderId: 'PFT-1', orderDescription: 'Boat - Half day', attemptId: 'attempt-1', customer: { fullName: 'Ana María Mora', email: 'ana@example.com' },
    ipAddress: '203.0.113.9', threeDSecure: validThreeDs };
  const body = gateway.buildSaleRequest(saleInput);
  assert.equal(body.get('type'), 'sale');
  assert.equal(body.get('amount'), '791.00');
  assert.equal(body.get('tax'), '91.00');
  assert.equal(body.get('first_name'), 'Ana María');
  assert.equal(body.get('last_name'), 'Mora');
  assert.equal(body.get('cardholder_auth'), 'verified');
  assert.equal(body.get('directory_server_id'), validThreeDs.directoryServerId);
  assert.equal(gateway.buildSaleRequest({ ...saleInput, type: 'auth' }).get('type'), 'auth');
  assert.throws(() => gateway.buildSaleRequest({ ...saleInput, type: 'credit' }));
  assert.equal(gateway.getBacGatewayApiUrl(), 'https://gateway.example.com/api/transact.php');
  assert.equal(loadGateway({ BAC_TRANSACTION_TYPE: 'AUTH' }).getBacCheckoutType(), 'auth');
  assert.equal(loadGateway({}).getBacCheckoutType(), 'sale');

  const approved = gateway.parseGatewayResponse('response=1&responsetext=SUCCESS&authcode=123456&transactionid=999&response_code=100&orderid=PFT-1&type=sale', 'PFT-1');
  assert.equal(approved.approved, true);
  assert.equal(approved.transactionId, '999');
  assert.equal(gateway.parseGatewayResponse('response=2&responsetext=DECLINE&response_code=200&transactionid=1&orderid=PFT-1', 'PFT-1').approved, false);
  assert.equal(gateway.parseGatewayResponse('response=1&response_code=100&transactionid=1&orderid=OTHER', 'PFT-1').approved, false);
  assert.equal(gateway.parseGatewayResponse('response=1&response_code=100&orderid=PFT-1', 'PFT-1').approved, false);
  assert.equal(gateway.parseGatewayResponse('response=3&response_code=100&transactionid=1', 'PFT-1').approved, false);
  assert.ok(!('payment_token' in approved.audit) && !('security_key' in approved.audit));
  assert.throws(() => loadGateway({ BAC_GATEWAY_URL: 'http://insecure.example.com' }).getBacGatewayApiUrl());
});

test('capture/void/refund requests reference the original transaction with strict amounts', () => {
  const gateway = loadGateway();
  const base = { securityKey: 'secret', transactionId: '1234567890', orderId: 'PFT-1' };
  const capture = gateway.buildFollowUpRequest({ ...base, type: 'capture', amount: '791.00' });
  assert.deepEqual(Object.fromEntries(capture), { security_key: 'secret', type: 'capture', transactionid: '1234567890', amount: '791.00', orderid: 'PFT-1' });
  const voided = gateway.buildFollowUpRequest({ ...base, type: 'void', amount: '5.00' });
  assert.equal(voided.get('amount'), null, 'void always cancels the whole transaction');
  assert.equal(gateway.buildFollowUpRequest({ ...base, type: 'refund', amount: '237.30' }).get('amount'), '237.30');
  assert.throws(() => gateway.buildFollowUpRequest({ ...base, type: 'refund' }));
  assert.throws(() => gateway.buildFollowUpRequest({ ...base, type: 'refund', amount: '0.00' }), 'a 0.00 refund would refund everything at NMI');
  assert.throws(() => gateway.buildFollowUpRequest({ ...base, type: 'refund', amount: '1' }));
  assert.throws(() => gateway.buildFollowUpRequest({ ...base, type: 'sale', amount: '1.00' }));
  assert.throws(() => gateway.buildFollowUpRequest({ ...base, type: 'void', transactionId: '1&amount=9' }));
});

function runEdgeFunction(file, { supabase, env, fetchImpl, extra = {} }) {
  let handler;
  const context = vm.createContext({ z, Response, Headers, URLSearchParams, AbortController, setTimeout, clearTimeout, crypto: globalThis.crypto, console: { error() {}, log() {} },
    Deno: { env: { get: (key) => env[key] } }, createClient: () => supabase, serve: (fn) => { handler = fn; }, withCors: (fn) => fn,
    corsHeaders: () => ({}), corsPreflight: () => new Response(null), areExternalProviderMocksAllowed: () => false, fetch: fetchImpl, ...extra });
  loadTs('supabase/functions/_shared/bac-gateway.ts', context);
  const source = fs.readFileSync(file, 'utf8').replace(/^import [\s\S]*?;\r?\n/gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return (body, headers = {}) => handler({ method: 'POST', headers: new Headers({ 'x-forwarded-for': '203.0.113.9', ...headers }), json: async () => body });
}

const gatewayEnv = { SUPABASE_URL: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', SUPABASE_ANON_KEY: 'anon', BAC_SECURITY_KEY: 'private-key', BAC_GATEWAY_URL: 'https://gateway.example.com' };

function loadProcessFunction({ gatewayText, gatewayError, beginError, env = {} } = {}) {
  const calls = { rpc: [], fetch: [], calendar: 0, emails: 0 };
  const booking = { id: '00000000-0000-4000-8000-000000000001', booking_reference: 'PFT-1', customers: { full_name: 'Ana Mora', email: 'ana@example.com' }, boats: { name: 'Second Wind' }, tour_packages: { name: 'Half Day' } };
  const query = { select() { return this; }, eq() { return this; }, single: async () => ({ data: booking, error: null }) };
  const supabase = {
    from: () => query,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'begin_bac_payment_attempt') return beginError ? { data: null, error: beginError } : { data: { attempt_id: 'attempt-1', transaction_type: args.p_transaction_type, booking_reference: 'PFT-1', amount: 791, tax_amount: 91, currency: 'USD' }, error: null };
      const auth = calls.rpc[0].args.p_transaction_type === 'auth';
      return { data: { payment_status: !args.p_approved ? 'pending' : auth ? 'authorized' : 'paid', booking_status: !args.p_approved ? 'pending_payment' : auth ? 'pending_confirmation' : 'confirmed' }, error: null };
    },
  };
  const call = runEdgeFunction('supabase/functions/bac-process-payment/index.ts', {
    supabase, env: { ...gatewayEnv, ...env },
    fetchImpl: async (url, init) => { calls.fetch.push({ url, body: new URLSearchParams(String(init.body)) }); if (gatewayError) throw gatewayError; return new Response(gatewayText, { status: 200 }); },
    extra: { enqueueBookingConfirmationEmails: async () => { calls.emails += 1; }, syncBookingCalendarAfterConfirmation: async () => { calls.calendar += 1; } },
  });
  return { call, calls };
}

const request = { bookingId: '00000000-0000-4000-8000-000000000001', paymentToken: 'tok_00000000', threeDSecure: validThreeDs, amount: '1.00' };
const approvedText = 'response=1&responsetext=SUCCESS&response_code=100&transactionid=TX-9&orderid=PFT-1';

test('checkout SALE charges the stored total, confirms, syncs Calendar and queues the email', async () => {
  const { call, calls } = loadProcessFunction({ gatewayText: approvedText });
  const response = await call(request);
  assert.equal(response.status, 200);
  const sale = calls.fetch[0];
  assert.equal(sale.url, 'https://gateway.example.com/api/transact.php');
  assert.equal(sale.body.get('type'), 'sale');
  assert.equal(sale.body.get('amount'), '791.00', 'the browser-supplied amount must be ignored');
  assert.equal(sale.body.get('security_key'), 'private-key');
  const settle = calls.rpc.find((entry) => entry.name === 'complete_bac_payment_attempt').args;
  assert.equal(settle.p_approved, true);
  assert.ok(!JSON.stringify(settle.p_raw_response).includes('tok_00000000'), 'tokens are never persisted');
  assert.deepEqual({ calendar: calls.calendar, emails: calls.emails }, { calendar: 1, emails: 1 });
  assert.equal((await response.json()).paymentStatus, 'paid');
});

test('checkout AUTHORIZE (BAC_TRANSACTION_TYPE=auth) only holds funds: no Calendar event and no confirmation email yet', async () => {
  const { call, calls } = loadProcessFunction({ gatewayText: approvedText, env: { BAC_TRANSACTION_TYPE: 'auth' } });
  const response = await call(request);
  assert.equal(response.status, 200);
  assert.equal(calls.fetch[0].body.get('type'), 'auth');
  assert.equal(calls.rpc[0].args.p_transaction_type, 'auth');
  assert.deepEqual({ calendar: calls.calendar, emails: calls.emails }, { calendar: 0, emails: 0 });
  assert.equal((await response.json()).paymentStatus, 'authorized');
});

test('checkout declines, missing 3DS, limits and unknown outcomes fail safely', async () => {
  const declined = loadProcessFunction({ gatewayText: 'response=2&responsetext=DECLINE&response_code=200&transactionid=TX-0&orderid=PFT-1' });
  assert.equal((await declined.call(request)).status, 402);
  assert.equal(declined.calls.rpc.at(-1).args.p_approved, false);
  assert.equal(declined.calls.emails, 0);

  const noThreeDs = loadProcessFunction({ gatewayText: '' });
  assert.equal((await noThreeDs.call({ ...request, threeDSecure: {} })).status, 400);
  assert.equal(noThreeDs.calls.rpc.length + noThreeDs.calls.fetch.length, 0);

  const limited = loadProcessFunction({ beginError: { code: '54000' } });
  assert.equal((await limited.call(request)).status, 429);
  assert.equal(limited.calls.fetch.length, 0);

  const timeout = loadProcessFunction({ gatewayError: new Error('aborted') });
  assert.equal((await timeout.call(request)).status, 502);
  assert.ok(!timeout.calls.rpc.some((entry) => entry.name === 'complete_bac_payment_attempt'), 'unknown outcomes stay processing for reconciliation');
});

function loadAdminFunction({ role = 'admin', gatewayText = 'response=1&responsetext=SUCCESS&response_code=100&transactionid=GW-2&orderid=PFT-1', gatewayError, beginError } = {}) {
  const calls = { rpc: [], fetch: [], calendar: 0, emails: 0 };
  const profileQuery = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role, active: true }, error: null }) };
  const supabase = {
    auth: { getUser: async (token) => (token === 'valid' ? { data: { user: { id: 'admin-1' } }, error: null } : { data: { user: null }, error: new Error('bad') }) },
    from: () => profileQuery,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'begin_bac_admin_operation') return beginError ? { data: null, error: beginError } : { data: { operation_id: 'op-1', operation: args.p_operation, booking_reference: 'PFT-1', gateway_transaction_id: 'GW-1', amount: args.p_amount ?? 791, currency: 'USD' }, error: null };
      return { data: { operation: calls.rpc[0].args.p_operation, approved: args.p_approved, amount: 791, payment_status: 'paid', booking_status: 'confirmed' }, error: null };
    },
  };
  const call = runEdgeFunction('supabase/functions/admin-bac-transaction/index.ts', {
    supabase, env: gatewayEnv,
    fetchImpl: async (url, init) => { calls.fetch.push({ url, body: new URLSearchParams(String(init.body)) }); if (gatewayError) throw gatewayError; return new Response(gatewayText, { status: 200 }); },
    extra: { enqueueBookingConfirmationEmails: async () => { calls.emails += 1; }, syncBookingCalendarAfterConfirmation: async () => { calls.calendar += 1; } },
  });
  const bookingId = '00000000-0000-4000-8000-000000000001';
  return { call: (body, token = 'valid') => call({ bookingId, ...body }, { authorization: `Bearer ${token}` }), calls };
}

test('admin CAPTURE / VOID / REFUND call the gateway with the ledger transaction, admins only', async () => {
  const capture = loadAdminFunction();
  assert.equal((await capture.call({ operation: 'capture' })).status, 200);
  assert.deepEqual(Object.fromEntries(capture.calls.fetch[0].body), { security_key: 'private-key', type: 'capture', transactionid: 'GW-1', amount: '791.00', orderid: 'PFT-1' });
  assert.equal(capture.calls.rpc[0].args.p_actor, 'admin-1');
  assert.deepEqual({ calendar: capture.calls.calendar, emails: capture.calls.emails }, { calendar: 1, emails: 1 });

  const voided = loadAdminFunction();
  assert.equal((await voided.call({ operation: 'void' })).status, 200);
  assert.equal(voided.calls.fetch[0].body.get('type'), 'void');
  assert.equal(voided.calls.fetch[0].body.get('amount'), null);
  assert.deepEqual({ calendar: voided.calls.calendar, emails: voided.calls.emails }, { calendar: 1, emails: 0 });

  const refund = loadAdminFunction();
  assert.equal((await refund.call({ operation: 'refund', amount: 237.3 })).status, 200);
  assert.equal(refund.calls.fetch[0].body.get('amount'), '237.30');
  assert.equal(refund.calls.rpc[0].args.p_amount, 237.3);

  const editor = loadAdminFunction({ role: 'editor' });
  assert.equal((await editor.call({ operation: 'refund', amount: 1 })).status, 403);
  assert.equal((await loadAdminFunction().call({ operation: 'void' }, 'forged')).status, 401);
  assert.equal(editor.calls.fetch.length + editor.calls.rpc.length, 0);
});

test('admin operations reject bad payloads, conflicts, declines and unknown outcomes safely', async () => {
  const invalid = loadAdminFunction();
  assert.equal((await invalid.call({ operation: 'credit' })).status, 400);
  assert.equal((await invalid.call({ operation: 'capture', amount: 5 })).status, 400, 'only refunds accept an amount');
  assert.equal((await invalid.call({ operation: 'refund', amount: -1 })).status, 400);
  assert.equal(invalid.calls.rpc.length, 0);

  const busy = loadAdminFunction({ beginError: { code: '55P03', message: 'busy' } });
  assert.equal((await busy.call({ operation: 'void' })).status, 409);

  const declined = loadAdminFunction({ gatewayText: 'response=2&responsetext=Transaction already settled&response_code=300&transactionid=GW-1&orderid=PFT-1' });
  const declinedResponse = await declined.call({ operation: 'void' });
  assert.equal(declinedResponse.status, 402);
  assert.match((await declinedResponse.json()).message, /already settled/);
  assert.equal(declined.calls.rpc.at(-1).args.p_approved, false);
  assert.equal(declined.calls.calendar, 0);

  const timeout = loadAdminFunction({ gatewayError: new Error('aborted') });
  assert.equal((await timeout.call({ operation: 'refund', amount: 10 })).status, 502);
  assert.ok(!timeout.calls.rpc.some((entry) => entry.name === 'complete_bac_admin_operation'));
});

test('an authorized booking cannot be cancelled without voiding the card hold first', async () => {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
    from: (table) => ({ select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: table === 'profiles' ? { role: 'admin', active: true } : { id: 'b1', booking_status: 'pending_confirmation', payment_status: 'authorized' }, error: null }) }),
    rpc: async () => assert.fail('the booking must not be cancelled'),
  };
  const response = await handleCancelBookingRequest(
    { method: 'POST', json: async () => ({ bookingId: '00000000-0000-4000-8000-000000000001' }), headers: new Headers({ authorization: 'Bearer valid' }) },
    { createClient: () => supabase, env: (key) => ({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' })[key] },
    {},
  );
  assert.equal(response.status, 409);
});

test('dashboard revenue subtracts partial card refunds from what was charged', async () => {
  const { loadDashboardMetrics } = await import('./support/load-ts.mjs');
  const metrics = loadDashboardMetrics();
  const row = { payment_status: 'paid', total_snapshot: 791, payments: [{ status: 'paid', amount: '791.00' }, { status: 'refunded', amount: '237.30' }, { status: 'failed', amount: '791.00' }] };
  assert.equal(metrics.collectedCents(row), 55370);
  assert.equal(metrics.collectedCents({ ...row, payments: [{ status: 'paid', amount: 100 }] }), 10000);
  assert.equal(metrics.collectedCents({ ...row, payments: [] }), 79100, 'manual payments still use the booking total');
});
