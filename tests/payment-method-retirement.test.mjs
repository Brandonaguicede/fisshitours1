import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as terms from '../supabase/functions/_shared/terms.mjs';
import { bookingPayload, createBookingDb, termsPayload } from './helpers/booking-db.mjs';

// "Pay on the Day of the Tour" (key 'pay-on-day', type 'pay_on_day') and its payment status 'not_required_yet' no longer exist as supported concepts.
const migration = fs.readFileSync('supabase/migrations/202610090001_retire_pay_on_day.sql', 'utf8');
const rejects = (promise, pattern) => assert.rejects(promise, (error) => { assert.match(String(error.message), pattern); return true; });

// ---- Edge Functions: the legacy key is an invalid payment method ---------------------------------------------------------------------------------

function load(file) {
  let handler; const created = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role: 'admin', active: true }, error: null }) }),
    rpc: async (name, args) => { if (name === 'check_booking_rate_limit') return { data: true, error: null }; created.push(args.payload); return { data: { booking_id: 'b', booking_reference: 'R', booking_status: 'pending_payment', payment_status: 'pending' }, error: null }; },
  };
  const env = { SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 's', DISABLE_TURNSTILE: 'true', RATE_LIMIT_HASH_SECRET: 'x' };
  const context = vm.createContext({ z, console, Response, crypto: globalThis.crypto, TextEncoder, Uint8Array, Deno: { env: { get: (key) => env[key] } }, serve: (fn) => { handler = fn; }, withCors: (fn) => fn, corsHeaders: () => ({}), corsPreflight: () => new Response(null), createClient: () => supabase, areExternalProviderMocksAllowed: () => false, buildBookingRequestAdminHtml: async () => '', buildBookingRequestSummary: async () => '', fetch: async () => new Response('{}'), ...terms });
  vm.runInContext(ts.transpile(fs.readFileSync(`supabase/functions/${file}/index.ts`, 'utf8').replace(/^import .*;\r?\n/gm, ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return { created, call: async (body) => { const response = await handler({ method: 'POST', headers: new Headers({ authorization: 'Bearer t', 'cf-connecting-ip': '1.1.1.1' }), json: async () => body }); return { status: response.status, body: await response.json() }; } };
}
const base = { customer: { fullName: 'Ana Perez', email: 'a@b.co', whatsapp: '50688888888' }, boatId: 'b', tourId: 't', tourPackageId: 'p', tourDate: '2099-10-01', timeSlotId: 's', guests: 2, departureLocationId: 'l', termsAccepted: true, termsVersion: 'v1' };

test('backend: create-booking and admin-create-booking REJECT payment method "pay-on-day" (and its variants) as invalid — nothing reaches the database', async () => {
  for (const file of ['create-booking', 'admin-create-booking']) {
    for (const key of ['pay-on-day', 'pay_on_day', 'pay-on-tour-day', 'Pay on the Day of the Tour', '']) {
      const { call, created } = load(file);
      const response = await call({ ...base, paymentMethodKey: key });
      assert.equal(response.status, 400, `${file} ${key}`);
      assert.equal(response.body.message, 'Invalid booking payload');
      assert.ok(response.body.issues.some((issue) => issue.path.includes('paymentMethodKey')), 'the payment method is what was refused');
      assert.equal(created.length, 0);
    }
  }
  // The supported methods still work.
  assert.equal((await load('create-booking').call({ ...base, paymentMethodKey: 'whatsapp-link' })).status, 201);
  assert.equal((await load('create-booking').call({ ...base, paymentMethodKey: 'paypal' })).status, 201);
  assert.equal((await load('admin-create-booking').call({ ...base, paymentMethodKey: 'whatsapp-link' })).status, 201);
  assert.equal((await load('admin-create-booking').call({ ...base })).status, 201, 'the admin default is the WhatsApp link');
});

// ---- Database: the migration really retires both concepts ------------------------------------------------------------------------------------------

async function withLegacy() {
  const ctx = await createBookingDb();
  // What production had: the sellable row and the legacy-typed method. (The helper schema is the real migrations, so the old values are valid here.)
  await ctx.db.exec(`insert into payment_methods(key,name,type) values ('pay-on-day','Pay on the Day of the Tour','pay_on_day'),('whatsapp-link','WhatsApp link','whatsapp_link');
    create schema if not exists auth; create or replace function auth.uid() returns uuid language sql as 'select null::uuid';`);
  return ctx;
}

test('migration: the legacy payment method row is deleted, the type is no longer allowed, the payment status is no longer allowed', async () => {
  const { db } = await withLegacy();
  try {
    await db.exec(migration);
    assert.equal((await db.query("select count(*)::int n from payment_methods where key = 'pay-on-day' or type = 'pay_on_day'")).rows[0].n, 0);
    assert.deepEqual((await db.query('select key from payment_methods order by key')).rows.map((row) => row.key), ['paypal', 'whatsapp-link']);
    await rejects(db.exec("insert into payment_methods(key,name,type) values ('x','X','pay_on_day')"), /payment_methods_type_check|check constraint/);
    await db.exec("insert into payment_methods(key,name,type) values ('sinpe','SINPE','sinpe')"); // other types still valid
    const { rows } = await db.query("select pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.bookings'::regclass and conname = 'bookings_payment_status_check'");
    assert.ok(rows[0].def.includes("'refunded'") && !rows[0].def.includes('not_required_yet'));
  } finally { await db.close(); }
});

test('migration: the RPC rejects the legacy key as an unavailable payment method; PayPal and WhatsApp bookings keep working with their normal statuses', async () => {
  const { db, create } = await withLegacy();
  try {
    await db.exec(migration);
    await rejects(create(bookingPayload({ ...termsPayload(), paymentMethodKey: 'pay-on-day', tourDate: '2099-03-01' })), /payment method is not available/);
    const whatsapp = await create(bookingPayload({ ...termsPayload(), paymentMethodKey: 'whatsapp-link', tourDate: '2099-03-02' }));
    assert.deepEqual([whatsapp.payment_status, whatsapp.booking_status], ['pending', 'pending_payment']);
    const paypal = await create(bookingPayload({ ...termsPayload(), paymentMethodKey: 'paypal', tourDate: '2099-03-03' }));
    assert.deepEqual([paypal.payment_status, paypal.booking_status], ['pending', 'pending_payment']);
    assert.equal((await db.query("select count(*)::int n from bookings where payment_status = 'not_required_yet'")).rows[0].n, 0);
    assert.doesNotMatch((await db.query("select pg_get_functiondef('public.create_booking_transaction(jsonb)'::regprocedure) def")).rows[0].def, /pay-on-day|not_required_yet/);
  } finally { await db.close(); }
});

test('migration: the payment status "not_required_yet" is refused everywhere (constraint and update_booking_status)', async () => {
  const { db, create } = await withLegacy();
  try {
    await db.exec(migration);
    const booking = await create(bookingPayload({ ...termsPayload(), paymentMethodKey: 'whatsapp-link', tourDate: '2099-04-01' }));
    await rejects(db.query("update bookings set payment_status = 'not_required_yet' where id = $1", [booking.booking_id]), /bookings_payment_status_check|check constraint/);
    await rejects(db.query("select update_booking_status($1::uuid, 'pending_confirmation', 'not_required_yet')", [booking.booking_id]), /invalid payment status/);
    // The remaining statuses still pass through the same function.
    await db.query("select update_booking_status($1::uuid, 'confirmed', 'paid')", [booking.booking_id]);
    assert.equal((await db.query('select payment_status from bookings where id = $1', [booking.booking_id])).rows[0].payment_status, 'paid');
    assert.doesNotMatch((await db.query("select pg_get_functiondef('public.update_booking_status(uuid,text,text,text)'::regprocedure) def")).rows[0].def, /not_required_yet/);
  } finally { await db.close(); }
});

test('migration fails LOUDLY (instead of rewriting history) if a database still holds a booking with the retired payment status', async () => {
  const { db, create } = await withLegacy();
  try {
    const legacy = await create(bookingPayload({ ...termsPayload(), paymentMethodKey: 'pay-on-day', tourDate: '2099-05-01' })); // still valid BEFORE the migration
    assert.equal(legacy.payment_status, 'not_required_yet');
    // The first thing it does is delete the method row: the booking that still references it (FK) stops the whole migration; the payment-status CHECK would too.
    await rejects(db.exec(migration), /foreign key constraint|bookings_payment_method_key_fkey|check constraint/);
    assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n, 1, 'nothing was rewritten or removed');
  } finally { await db.close(); }
});

// ---- No supported code, seed, type or label still knows the retired concepts ---------------------------------------------------------------------------

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mjs|js|json|sql|md)$/.test(entry.name)) yield full;
  }
}
const legacyConcepts = /pay[-_ ]?on[-_ ]?(the[-_ ]?)?(day|tour)|pay_on_tour_day|not_required_yet|payOnDay|pago el d[ií]a( del tour)?|Pago en (el )?tour|D[ií]a del tour/i;

test('classification: the retired concepts survive ONLY in historical migrations (never edited), the retiring migration and the archived specs — not in code, seeds, types, labels or exports', () => {
  const live = [...walk('src'), ...walk('supabase/functions'), 'supabase/seed.sql', 'supabase/README.md', 'supabase/config.toml'];
  const offenders = live.filter((file) => legacyConcepts.test(fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, ''))).map((file) => file.split(path.sep).join('/'));
  assert.deepEqual(offenders, [], 'no live code / seed / doc knows pay-on-day or not_required_yet');
  // Historical migrations are history: they keep the old values and are not rewritten; only the new migration retires the support.
  const historical = [...walk('supabase/migrations')].filter((file) => legacyConcepts.test(fs.readFileSync(file, 'utf8'))).map((file) => path.basename(file));
  assert.ok(historical.includes('202608160001_initial_backend.sql') && historical.includes('202610090001_retire_pay_on_day.sql'));
  assert.ok(historical.every((name) => name < '202610090001' || name === '202610090001_retire_pay_on_day.sql'), 'nothing newer than the retiring migration mentions them');
});
