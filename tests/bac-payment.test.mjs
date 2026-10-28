// BAC Credomatic card payments: database state machine, gateway helpers and
// the bac-process-payment Edge Function (with network and Supabase doubles).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { loadTs, plain } from './support/load-ts.mjs';

const migration = fs.readFileSync('supabase/migrations/202610280001_bac_card_payments.sql', 'utf8');

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table payment_methods (key text primary key, name text not null, description text, description_en text, description_es text,
      type text not null constraint payment_methods_type_check check (type in ('paypal','whatsapp_link')),
      active boolean not null default true, instructions text, logo_url text, sort_order int not null default 0);
    insert into payment_methods (key, name, type) values ('paypal','PayPal','paypal'), ('whatsapp-link','WhatsApp','whatsapp_link');
    create table bookings (id uuid primary key default gen_random_uuid(), booking_reference text not null, payment_method_key text not null,
      payment_status text not null, booking_status text not null, currency text not null default 'USD',
      total_snapshot numeric(10,2) not null, tax_amount_snapshot numeric(10,2) not null default 0, expires_at timestamptz);
    create table payments (id uuid primary key default gen_random_uuid(), booking_id uuid not null references bookings(id),
      provider text not null constraint payments_provider_check check (provider in ('paypal','manual','whatsapp')),
      provider_order_id text, provider_capture_id text, amount numeric(10,2) not null, currency text not null,
      status text not null, raw_response jsonb, updated_at timestamptz default now());
    create table booking_status_history (booking_id uuid, previous_booking_status text, new_booking_status text,
      previous_payment_status text, new_payment_status text, note text);
    create table availability_blocks (booking_id uuid, source text, active boolean);
  `);
  await db.exec(migration);
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

test('card method is seeded inactive and card bookings get a payment hold', async () => {
  const db = await createDatabase();
  try {
    const method = (await db.query(`select type, active from payment_methods where key = 'bac-card'`)).rows[0];
    assert.deepEqual(method, { type: 'card', active: false });
    const booking = await insertCardBooking(db);
    assert.ok(booking.expires_at, 'card bookings must expire like PayPal holds');
    const other = (await db.query(`insert into bookings (booking_reference, payment_method_key, payment_status, booking_status, total_snapshot)
      values ('PFT-WA', 'whatsapp-link', 'pending', 'pending_payment', 100) returning expires_at`)).rows[0];
    assert.equal(other.expires_at, null);
  } finally { await db.close(); }
});

test('attempts are serialized, capped and only an exact amount confirms the booking', async () => {
  const db = await createDatabase();
  try {
    const booking = await insertCardBooking(db);
    const begin = async () => (await db.query('select begin_bac_payment_attempt($1, 3) as r', [booking.id])).rows[0].r;
    const complete = (attemptId, approved, amount = 791) => db.query(
      `select complete_bac_payment_attempt($1, $2, 'TX-1', $3, 'USD', 'note', '{}'::jsonb) as r`, [attemptId, approved, amount]);

    const first = await begin();
    assert.equal(Number(first.amount), 791);
    assert.equal(Number(first.tax_amount), 91);
    assert.equal(first.booking_reference, 'PFT-CARD0001');
    assert.equal((await rpcError(begin())).code, '55P03', 'a second concurrent charge must be refused');

    await complete(first.attempt_id, false);
    assert.equal((await db.query('select payment_status from bookings where id = $1', [booking.id])).rows[0].payment_status, 'pending');
    assert.match((await rpcError(complete(first.attempt_id, true))).message, /already settled/);

    const second = await begin();
    assert.match((await rpcError(complete(second.attempt_id, true, 1))).message, /does not match/);
    await complete(second.attempt_id, true);
    const paid = (await db.query('select payment_status, booking_status, expires_at from bookings where id = $1', [booking.id])).rows[0];
    assert.deepEqual(paid, { payment_status: 'paid', booking_status: 'confirmed', expires_at: null });
    assert.match((await rpcError(begin())).message, /not ready/);

    const capped = await insertCardBooking(db, 'PFT-CAP');
    for (let index = 0; index < 3; index += 1) {
      const attempt = (await db.query('select begin_bac_payment_attempt($1, 3) as r', [capped.id])).rows[0].r;
      await db.query(`select complete_bac_payment_attempt($1, false, '', 791, 'USD', 'declined', '{}'::jsonb)`, [attempt.attempt_id]);
    }
    assert.equal((await rpcError(db.query('select begin_bac_payment_attempt($1, 3)', [capped.id]))).code, '54000');
  } finally { await db.close(); }
});

test('expired pending card holds are released, in-flight charges are kept for reconciliation', async () => {
  const db = await createDatabase();
  try {
    const abandoned = await insertCardBooking(db, 'PFT-OLD');
    const inFlight = await insertCardBooking(db, 'PFT-FLY');
    await db.query('select begin_bac_payment_attempt($1, 3)', [inFlight.id]);
    await db.exec(`update bookings set expires_at = now() - interval '1 minute'`);
    assert.equal((await db.query('select expire_pending_bac_bookings() as n')).rows[0].n, 1);
    const rows = (await db.query('select booking_reference, booking_status, payment_status from bookings order by booking_reference')).rows;
    assert.deepEqual(rows, [
      { booking_reference: 'PFT-FLY', booking_status: 'pending_payment', payment_status: 'processing' },
      { booking_reference: 'PFT-OLD', booking_status: 'cancelled', payment_status: 'failed' },
    ]);
    assert.equal((await db.query('select active from availability_blocks where booking_id = $1', [abandoned.id])).rows[0].active, false);
  } finally { await db.close(); }
});

test('RPCs are not executable by browser roles', async () => {
  const db = await createDatabase();
  try {
    const { rows } = await db.query(`select has_function_privilege('anon', 'begin_bac_payment_attempt(uuid,int)', 'execute') as anon,
      has_function_privilege('authenticated', 'complete_bac_payment_attempt(uuid,boolean,text,numeric,text,text,jsonb)', 'execute') as auth,
      has_function_privilege('service_role', 'begin_bac_payment_attempt(uuid,int)', 'execute') as service`);
    assert.deepEqual(rows[0], { anon: false, auth: false, service: true });
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

test('sale request carries server amounts and 3DS values; response parsing is fail-closed', () => {
  const gateway = loadGateway({ BAC_GATEWAY_URL: 'https://gateway.example.com/' });
  const body = gateway.buildSaleRequest({ securityKey: 'secret', paymentToken: 'tok_1', amount: '791.00', taxAmount: '91.00', currency: 'USD',
    orderId: 'PFT-1', orderDescription: 'Boat - Half day', attemptId: 'attempt-1', customer: { fullName: 'Ana María Mora', email: 'ana@example.com' },
    ipAddress: '203.0.113.9', threeDSecure: validThreeDs });
  assert.equal(body.get('type'), 'sale');
  assert.equal(body.get('amount'), '791.00');
  assert.equal(body.get('tax'), '91.00');
  assert.equal(body.get('first_name'), 'Ana María');
  assert.equal(body.get('last_name'), 'Mora');
  assert.equal(body.get('cardholder_auth'), 'verified');
  assert.equal(body.get('directory_server_id'), validThreeDs.directoryServerId);
  assert.equal(gateway.getBacGatewayApiUrl(), 'https://gateway.example.com/api/transact.php');

  const approved = gateway.parseSaleResponse('response=1&responsetext=SUCCESS&authcode=123456&transactionid=999&response_code=100&orderid=PFT-1&type=sale', 'PFT-1');
  assert.equal(approved.approved, true);
  assert.equal(approved.transactionId, '999');
  assert.equal(gateway.parseSaleResponse('response=2&responsetext=DECLINE&response_code=200&transactionid=1&orderid=PFT-1', 'PFT-1').approved, false);
  assert.equal(gateway.parseSaleResponse('response=1&response_code=100&transactionid=1&orderid=OTHER', 'PFT-1').approved, false);
  assert.equal(gateway.parseSaleResponse('response=1&response_code=100&orderid=PFT-1', 'PFT-1').approved, false);
  assert.equal(gateway.parseSaleResponse('response=3&response_code=100&transactionid=1', 'PFT-1').approved, false);
  assert.ok(!('payment_token' in approved.audit) && !('security_key' in approved.audit));
  assert.throws(() => loadGateway({ BAC_GATEWAY_URL: 'http://insecure.example.com' }).getBacGatewayApiUrl());
});

function loadProcessFunction({ gatewayText, gatewayError, beginError } = {}) {
  const calls = { rpc: [], fetch: [] };
  const booking = { id: '00000000-0000-4000-8000-000000000001', booking_reference: 'PFT-1', customers: { full_name: 'Ana Mora', email: 'ana@example.com' }, boats: { name: 'Second Wind' }, tour_packages: { name: 'Half Day' } };
  const query = { select() { return this; }, eq() { return this; }, single: async () => ({ data: booking, error: null }) };
  const supabase = {
    from: () => query,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'begin_bac_payment_attempt') return beginError ? { data: null, error: beginError } : { data: { attempt_id: 'attempt-1', booking_reference: 'PFT-1', amount: 791, tax_amount: 91, currency: 'USD' }, error: null };
      return { data: { payment_status: args.p_approved ? 'paid' : 'pending', booking_status: args.p_approved ? 'confirmed' : 'pending_payment' }, error: null };
    },
  };
  let handler;
  const env = { SUPABASE_URL: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', BAC_SECURITY_KEY: 'private-key', BAC_GATEWAY_URL: 'https://gateway.example.com' };
  const context = vm.createContext({ z, Response, URLSearchParams, AbortController, setTimeout, clearTimeout, crypto: globalThis.crypto, console: { error() {} },
    Deno: { env: { get: (key) => env[key] } }, createClient: () => supabase, serve: (fn) => { handler = fn; }, withCors: (fn) => fn,
    corsHeaders: () => ({}), corsPreflight: () => new Response(null), areExternalProviderMocksAllowed: () => false,
    enqueueBookingConfirmationEmails: async () => { calls.emails = (calls.emails ?? 0) + 1; },
    fetch: async (url, init) => {
      calls.fetch.push({ url, body: new URLSearchParams(String(init.body)) });
      if (gatewayError) throw gatewayError;
      return new Response(gatewayText, { status: 200 });
    } });
  loadTs('supabase/functions/_shared/bac-gateway.ts', context);
  const source = fs.readFileSync('supabase/functions/bac-process-payment/index.ts', 'utf8').replace(/^import [\s\S]*?;\r?\n/gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  const call = (body) => handler({ method: 'POST', headers: new Headers({ 'x-forwarded-for': '203.0.113.9' }), json: async () => body });
  return { call, calls };
}

const request = { bookingId: '00000000-0000-4000-8000-000000000001', paymentToken: 'tok_00000000', threeDSecure: validThreeDs, amount: '1.00' };

test('approved sale charges the stored total and confirms the booking', async () => {
  const { call, calls } = loadProcessFunction({ gatewayText: 'response=1&responsetext=SUCCESS&response_code=100&transactionid=TX-9&orderid=PFT-1' });
  const response = await call(request);
  assert.equal(response.status, 200);
  const sale = calls.fetch[0];
  assert.equal(sale.url, 'https://gateway.example.com/api/transact.php');
  assert.equal(sale.body.get('amount'), '791.00', 'the browser-supplied amount must be ignored');
  assert.equal(sale.body.get('security_key'), 'private-key');
  const settle = calls.rpc.find((entry) => entry.name === 'complete_bac_payment_attempt').args;
  assert.equal(settle.p_approved, true);
  assert.equal(settle.p_transaction_id, 'TX-9');
  assert.ok(!JSON.stringify(settle.p_raw_response).includes('tok_00000000'), 'tokens are never persisted');
  assert.equal(calls.emails, 1);
  assert.equal((await response.json()).paymentStatus, 'paid');
});

test('declines, missing 3DS, limits and unknown outcomes fail safely', async () => {
  const declined = loadProcessFunction({ gatewayText: 'response=2&responsetext=DECLINE&response_code=200&transactionid=TX-0&orderid=PFT-1' });
  const declinedResponse = await declined.call(request);
  assert.equal(declinedResponse.status, 402);
  assert.equal(declined.calls.rpc.at(-1).args.p_approved, false);
  assert.equal(declined.calls.emails, undefined);

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
