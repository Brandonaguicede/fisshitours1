// Booking attempts ("leads"): contact data kept when someone abandons the last booking step.
// The database part runs the real migrations on PGlite (the project's booking schema + 202611240001_booking_leads.sql); the Edge Functions run
// against Supabase doubles; the helpers and the BookingPanel wiring are checked as shipped. No browser needed (the Admin UI has its own file).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { createBookingDb, bookingPayload, termsPayload } from './helpers/booking-db.mjs';
import { loadTs, plain } from './support/load-ts.mjs';

const LEAD_MIGRATION = fs.readFileSync('supabase/migrations/202611240001_booking_leads.sql', 'utf8');
const token = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const contact = (overrides = {}) => ({ fullName: 'Ana Mora', email: 'ana@example.com', whatsapp: '+50688881234', ...overrides });
const leadPayload = (clientToken, overrides = {}) => ({
  clientToken, language: 'es', customer: contact(overrides.customer),
  context: { boatId: 'boat', tourId: 'tour', tourPackageId: 'pkg', tourDate: '2099-10-01', timeSlotId: 'slot', guests: 4, ...overrides.context },
});

async function createLeadDatabase() {
  const fixture = await createBookingDb();
  const { db } = fixture;
  await db.exec(`create function public.is_admin_editor_viewer() returns boolean language sql stable
    as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
    grant execute on function public.is_admin_editor_viewer() to anon, authenticated;`);
  await db.exec('alter role service_role bypassrls'); // like Supabase: the service role is not subject to RLS
  await db.exec(LEAD_MIGRATION);
  const upsert = async (payload) => (await db.query('select upsert_booking_lead($1::jsonb) as result', [JSON.stringify(payload)])).rows[0].result;
  const count = async (table) => Number((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n);
  const leads = async () => (await db.query('select * from booking_leads order by created_at, id')).rows;
  return { ...fixture, upsert, count, leads };
}

const raises = async (promise, pattern) => {
  try { await promise; } catch (error) { assert.match(String(error.message), pattern); return; }
  assert.fail(`expected the call to raise ${pattern}`);
};

// ---- Database -----------------------------------------------------------------------------------------------------------------------

test('booking leads: incomplete or invalid contact data never creates a lead', async () => {
  const { upsert, count } = await createLeadDatabase();
  const invalid = [
    { customer: { fullName: '' } }, { customer: { fullName: 'A' } }, { customer: { email: '' } }, { customer: { email: 'not-an-email' } },
    { customer: { email: 'a@b' } }, { customer: { whatsapp: '' } }, { customer: { whatsapp: '12345' } }, { customer: { whatsapp: '8888 1234' } }, { customer: { whatsapp: '88881234' } }, { customer: { whatsapp: '+0123456789' } }, { customer: { whatsapp: '+5068888123x' } }, { customer: { whatsapp: '+506 8888 1234' } },
  ];
  for (const overrides of invalid) await raises(upsert(leadPayload(token(1), overrides)), /LEAD_CONTACT_INVALID/);
  await raises(upsert({ ...leadPayload(token(1)), clientToken: 'nope' }), /LEAD_TOKEN_INVALID/);
  await raises(upsert({ ...leadPayload(token(1)), language: 'fr' }), /LEAD_LANGUAGE_INVALID/);
  assert.equal(await count('booking_leads'), 0);
});

test('booking leads: valid contact data creates a lead with server-resolved labels', async () => {
  const { upsert, leads } = await createLeadDatabase();
  assert.deepEqual(plain(await upsert(leadPayload(token(1)))), { saved: true, created: true });
  const [lead] = await leads();
  assert.equal(lead.status, 'open');
  assert.equal(lead.full_name, 'Ana Mora');
  assert.equal(lead.email, 'ana@example.com');
  assert.equal(lead.whatsapp, '+50688881234');
  assert.equal(lead.language, 'es');
  assert.equal(lead.boat_name, 'Second Wind');
  assert.equal(lead.tour_title, 'Fishing Tour');
  assert.equal(lead.package_name, 'Half Day');
  assert.equal(lead.time_slot_label, 'Morning');
  assert.equal(lead.guests, 4);
  assert.equal(lead.booking_id, null);
  assert.equal(lead.converted_at, null);
});

test('booking leads: the client never supplies labels, and unknown catalog ids simply have no label', async () => {
  const { upsert, leads } = await createLeadDatabase();
  await upsert({ ...leadPayload(token(1), { context: { tourId: 'ghost-tour', tourPackageId: 'ghost-pkg' } }), context: { tourId: 'ghost-tour', tourPackageId: 'ghost-pkg', tourTitle: 'Injected title' } });
  const [lead] = await leads();
  assert.equal(lead.tour_title, null);
  assert.equal(lead.package_name, null);
  assert.equal(lead.tour_date, null, 'a date the client did not send is not invented');
  assert.equal(lead.guests, null);
});

test('booking leads: the same client_token updates its own lead, it never duplicates', async () => {
  const { upsert, leads, count } = await createLeadDatabase();
  await upsert(leadPayload(token(1)));
  const first = (await leads())[0];
  const result = await upsert(leadPayload(token(1), { customer: { whatsapp: '+50688889999' }, context: { guests: 6, timeSlotId: 'slot2' } }));
  assert.deepEqual(plain(result), { saved: true, created: false, changed: true });
  assert.equal(await count('booking_leads'), 1);
  const [updated] = await leads();
  assert.equal(updated.id, first.id);
  assert.equal(updated.whatsapp, '+50688889999');
  assert.equal(updated.guests, 6);
  assert.equal(updated.time_slot_label, 'Afternoon');
  assert.ok(new Date(updated.updated_at) >= new Date(first.updated_at));
});

test('booking leads: saving identical data again changes nothing (last activity is not bumped)', async () => {
  const { db, upsert, leads } = await createLeadDatabase();
  await upsert(leadPayload(token(1)));
  await db.query(`update booking_leads set updated_at = now() - interval '2 hours'`);
  const before = (await leads())[0].updated_at;
  assert.deepEqual(plain(await upsert(leadPayload(token(1)))), { saved: true, created: false, changed: false });
  assert.equal((await leads())[0].updated_at.getTime(), before.getTime());
});

test('booking leads: the same email, WhatsApp or name with another token is a separate lead and overwrites nobody', async () => {
  const { upsert, leads, count } = await createLeadDatabase();
  await upsert(leadPayload(token(1)));
  await upsert(leadPayload(token(2), { customer: { fullName: 'Another Person', whatsapp: '+50670001111' } })); // same email
  await upsert(leadPayload(token(3), { customer: { fullName: 'Third Person', email: 'third@example.com' } })); // same WhatsApp
  await upsert(leadPayload(token(4), { customer: { email: 'fourth@example.com', whatsapp: '+50670002222' } })); // same name
  assert.equal(await count('booking_leads'), 4);
  const rows = await leads();
  const original = rows.find((row) => row.client_token === token(1));
  assert.equal(original.full_name, 'Ana Mora');
  assert.equal(original.email, 'ana@example.com');
  assert.equal(original.whatsapp, '+50688881234');
  assert.deepEqual(rows.map((row) => row.client_token).sort(), [token(1), token(2), token(3), token(4)]);
});

test('booking leads: saving leads creates no customer, booking, availability block or payment', async () => {
  const { upsert, count } = await createLeadDatabase();
  const tables = ['customers', 'bookings', 'availability_blocks', 'payments'];
  const before = {};
  for (const table of tables) before[table] = await count(table);
  await upsert(leadPayload(token(1)));
  await upsert(leadPayload(token(1), { context: { guests: 2 } }));
  await upsert(leadPayload(token(2)));
  for (const table of tables) assert.equal(await count(table), before[table], `${table} must be untouched`);
  assert.equal(await count('booking_leads'), 2);
});

test('booking leads: there is no foreign key to the catalog, so deleting a tour never touches a lead', async () => {
  const { db, upsert, leads } = await createLeadDatabase();
  await upsert(leadPayload(token(1)));
  const { rows } = await db.query(`select conrelid::regclass::text as t, confrelid::regclass::text as f from pg_constraint where contype = 'f' and conrelid = 'public.booking_leads'::regclass`);
  assert.deepEqual(rows.map((row) => row.f), ['bookings'], 'the only foreign key is booking_id -> bookings');
  assert.match(LEAD_MIGRATION, /booking_id uuid references public\.bookings\(id\) on delete set null/);
  await db.exec(`update booking_leads set tour_id = tour_id`); // still valid
  assert.equal((await leads())[0].tour_title, 'Fishing Tour', 'the snapshot label outlives the catalog row');
});

test('booking leads: conversion marks the lead, links the booking, wipes personal data and keeps the booking valid', async () => {
  const { db, upsert, create, leads, count } = await createLeadDatabase();
  await upsert(leadPayload(token(1)));
  const booking = await create({ ...bookingPayload(), ...termsPayload() });
  assert.equal(await count('customers'), 1);
  const marked = (await db.query('select mark_booking_lead_converted($1, $2) as ok', [token(1), booking.booking_id])).rows[0].ok;
  assert.equal(marked, true);
  const [lead] = await leads();
  assert.equal(lead.status, 'converted');
  assert.equal(lead.booking_id, booking.booking_id);
  assert.ok(lead.converted_at);
  assert.deepEqual([lead.full_name, lead.email, lead.whatsapp], [null, null, null], 'the booking/customer own the personal data now');
  assert.equal(lead.tour_title, 'Fishing Tour', 'the trace of what was booked stays');
  assert.equal(await count('customers'), 1, 'conversion creates no customer');
  assert.equal(await count('bookings'), 1);
  assert.equal(await count('availability_blocks'), 1, 'only the booking itself holds the slot');
  // Idempotent: a second call and a late save from the same browser do not reopen the lead or put the data back.
  assert.equal((await db.query('select mark_booking_lead_converted($1, $2) as ok', [token(1), booking.booking_id])).rows[0].ok, false);
  assert.deepEqual(plain(await upsert(leadPayload(token(1)))), { saved: false, converted: true });
  assert.equal((await leads())[0].email, null);
});

test('booking leads: marking a token that matches nothing is a harmless no-op and the booking stays valid', async () => {
  const { db, upsert, create, leads, count } = await createLeadDatabase();
  await upsert(leadPayload(token(1)));
  const booking = await create({ ...bookingPayload(), ...termsPayload() });
  const result = (await db.query('select mark_booking_lead_converted($1, $2) as ok', [token(99), booking.booking_id])).rows[0].ok;
  assert.equal(result, false);
  assert.equal((await leads())[0].status, 'open');
  assert.equal(await count('bookings'), 1);
  assert.equal((await db.query('select booking_status from bookings')).rows[0].booking_status, 'pending_payment');
  assert.equal((await db.query('select mark_booking_lead_converted(null, $1) as ok', [booking.booking_id])).rows[0].ok, false);
});

test('booking leads: only service_role can write; anonymous cannot read; staff can read, others see nothing', async () => {
  const { db, upsert } = await createLeadDatabase();
  await upsert(leadPayload(token(1)));
  const asRole = async (role, admin, fn) => {
    await db.exec(`set role ${role}; select set_config('test.admin', '${admin ? 'on' : 'off'}', false)`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  await raises(asRole('anon', false, () => db.query('select * from booking_leads')), /permission denied/i);
  assert.equal((await asRole('authenticated', true, () => db.query('select * from booking_leads'))).rows.length, 1, 'staff can read');
  assert.equal((await asRole('authenticated', false, () => db.query('select * from booking_leads'))).rows.length, 0, 'a signed-in non-staff user sees nothing (RLS)');
  for (const role of ['anon', 'authenticated']) {
    await raises(asRole(role, true, () => db.query(`insert into booking_leads (client_token, full_name, email, whatsapp) values (gen_random_uuid(), 'X Y', 'x@y.co', '1234567')`)), /permission denied/i);
    await raises(asRole(role, true, () => db.query(`update booking_leads set full_name = 'Hacked'`)), /permission denied/i);
    await raises(asRole(role, true, () => db.query(`delete from booking_leads`)), /permission denied/i);
    await raises(asRole(role, true, () => db.query(`select upsert_booking_lead('{}'::jsonb)`)), /permission denied/i);
    await raises(asRole(role, true, () => db.query(`select mark_booking_lead_converted(gen_random_uuid(), gen_random_uuid())`)), /permission denied/i);
    await raises(asRole(role, true, () => db.query(`select purge_booking_leads()`)), /permission denied/i);
  }
  assert.equal((await asRole('service_role', false, () => db.query('select * from booking_leads'))).rows.length, 1);
});

test('booking leads: retention deletes open leads 30 days after their last activity and keeps everything else', async () => {
  const { db, upsert, create, count } = await createLeadDatabase();
  await upsert(leadPayload(token(1))); await upsert(leadPayload(token(2))); await upsert(leadPayload(token(3)));
  const booking = await create({ ...bookingPayload(), ...termsPayload() });
  await db.query('select mark_booking_lead_converted($1, $2)', [token(3), booking.booking_id]);
  await db.query(`update booking_leads set updated_at = now() - interval '31 days' where client_token in ($1, $2)`, [token(1), token(3)]);
  await db.query(`update booking_leads set updated_at = now() - interval '29 days' where client_token = $1`, [token(2)]);
  assert.equal((await db.query('select purge_booking_leads() as n')).rows[0].n, 1);
  const remaining = (await db.query('select client_token, status from booking_leads order by client_token')).rows;
  assert.deepEqual(remaining.map((row) => [row.client_token, row.status]), [[token(2), 'open'], [token(3), 'converted']]);
  assert.equal(await count('bookings'), 1);
  assert.match(LEAD_MIGRATION, /interval '30 days'/);
  assert.match(LEAD_MIGRATION, /cron\.schedule\('purge-booking-leads'/, 'scheduled with the pg_cron the project already uses');
});

test('booking leads: the migration is new, does not redefine the booking RPC and keeps phase-one scope', () => {
  const migrations = fs.readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.filter((name) => name.includes('booking_leads')).length, 1);
  assert.ok(migrations.indexOf('202611240001_booking_leads.sql') > migrations.indexOf('202611170001_measurement_campaign_fields.sql'), 'after the latest migration of main');
  assert.doesNotMatch(LEAD_MIGRATION, /create or replace function public\.create_booking_transaction/);
  assert.doesNotMatch(LEAD_MIGRATION, /(insert into|update|delete from)\s+public\.(customers|bookings|availability_blocks|payments)/i);
});

// ---- Edge Functions -----------------------------------------------------------------------------------------------------------------

function runEdgeFunction(file, { supabase, env, extra = {}, logs = [] }) {
  let handler;
  const context = vm.createContext({ z, Response, Headers, URLSearchParams, TextEncoder, AbortController, setTimeout, clearTimeout, crypto: globalThis.crypto,
    console: { error: (...args) => logs.push(args), log: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
    Deno: { env: { get: (key) => env[key] } }, createClient: () => supabase, serve: (fn) => { handler = fn; }, withCors: (fn) => fn,
    corsHeaders: () => ({}), corsPreflight: () => new Response(null), areExternalProviderMocksAllowed: () => false,
    fetch: async () => { throw new Error('no network in tests'); }, ...extra });
  const source = fs.readFileSync(file, 'utf8').replace(/^import [\s\S]*?;\r?\n/gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return (body, headers = {}) => handler({ method: 'POST', headers: new Headers({ 'x-forwarded-for': '203.0.113.9', ...headers }), json: async () => body });
}
const env = { SUPABASE_URL: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', RATE_LIMIT_HASH_SECRET: 'test-rate-secret', DISABLE_TURNSTILE: 'true' };

function loadSaveFunction({ rateLimited = false, rpcError = null } = {}) {
  const calls = { rpc: [], logs: [] };
  const supabase = { rpc: async (name, args) => { calls.rpc.push({ name, args }); if (name === 'check_booking_rate_limit') return { data: !rateLimited, error: null }; return rpcError ? { data: null, error: rpcError } : { data: { saved: true }, error: null }; } };
  return { call: runEdgeFunction('supabase/functions/save-booking-lead/index.ts', { supabase, env, logs: calls.logs }), calls };
}
const upserts = (calls) => calls.rpc.filter((entry) => entry.name === 'upsert_booking_lead');

test('save-booking-lead: validates with zod, calls only the lead RPC and never touches booking tables', async () => {
  const { call, calls } = loadSaveFunction();
  for (const body of [null, {}, leadPayload('nope'), leadPayload(token(1), { customer: { fullName: 'A' } }), leadPayload(token(1), { customer: { email: 'bad' } }), leadPayload(token(1), { customer: { whatsapp: '123' } }), leadPayload(token(1), { customer: { whatsapp: '8888 1234' } }), leadPayload(token(1), { customer: { whatsapp: '88881234' } })]) {
    assert.equal((await call(body)).status, 400);
  }
  assert.equal(upserts(calls).length, 0, 'invalid data never reaches the database');
  const ok = await call(leadPayload(token(1)));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { saved: true });
  assert.equal(upserts(calls).length, 1);
  assert.equal(upserts(calls)[0].args.p.clientToken, token(1));
  assert.deepEqual(calls.rpc.map((entry) => entry.name).sort(), ['check_booking_rate_limit', 'upsert_booking_lead']);
  const source = fs.readFileSync('supabase/functions/save-booking-lead/index.ts', 'utf8');
  assert.doesNotMatch(source, /create_booking_transaction|\.from\(['"](customers|bookings|availability_blocks|payments)/);
});

test('save-booking-lead: uses its own rate-limit bucket, answers 429 and logs no contact data', async () => {
  const { call, calls } = loadSaveFunction({ rateLimited: true });
  assert.equal((await call(leadPayload(token(1)))).status, 429);
  assert.equal(upserts(calls).length, 0);
  const rate = calls.rpc.find((entry) => entry.name === 'check_booking_rate_limit').args;
  const hmac = (value) => crypto.createHmac('sha256', 'test-rate-secret').update(value).digest('hex');
  assert.equal(rate.p_ip_hash, hmac('lead:203.0.113.9'));
  assert.notEqual(rate.p_ip_hash, hmac('203.0.113.9'), 'never the booking bucket');

  const failing = loadSaveFunction({ rpcError: { code: 'XX000', message: 'boom for ana@example.com +50688881234' } });
  assert.equal((await failing.call(leadPayload(token(1)))).status, 500);
  assert.doesNotMatch(JSON.stringify(failing.calls.logs), /ana@example\.com|50688881234|Ana Mora/);
});

function loadCreateBookingFunction({ markError = null, markThrows = false } = {}) {
  const calls = { rpc: [], logs: [] };
  const supabase = {
    from: () => ({ insert: async () => ({ error: null }) }),
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'check_booking_rate_limit') return { data: true, error: null };
      if (name === 'create_booking_transaction') return { data: { booking_id: '11111111-1111-4111-8111-111111111111', booking_reference: 'PFT-TEST0001' }, error: null };
      if (name === 'mark_booking_lead_converted') { if (markThrows) throw new Error('network down'); return { data: null, error: markError }; }
      return { data: null, error: null };
    },
  };
  const call = runEdgeFunction('supabase/functions/create-booking/index.ts', {
    supabase, env, logs: calls.logs, extra: { checkTermsAcceptance: () => ({ ok: true, legacy: false, termsVersion: 'v1' }), measurementReceipt: async () => undefined },
  });
  return { call, calls };
}
const bookingRequest = (extra = {}) => ({
  customer: contact(), boatId: 'boat', tourId: 'tour', tourPackageId: 'pkg', tourDate: '2099-10-01', timeSlotId: 'slot', guests: 4,
  departureLocationId: 'dock', paymentMethodKey: 'whatsapp-link', extras: [], language: 'es', termsAccepted: true, termsVersion: 'v1', ...extra,
});

test('create-booking: marks the lead converted after the booking exists, outside create_booking_transaction', async () => {
  const { call, calls } = loadCreateBookingFunction();
  const response = await call(bookingRequest({ leadToken: token(1) }));
  assert.equal(response.status, 201);
  const names = calls.rpc.map((entry) => entry.name);
  assert.ok(names.indexOf('mark_booking_lead_converted') > names.indexOf('create_booking_transaction'), 'only after the booking was created');
  assert.deepEqual(plain(calls.rpc.find((entry) => entry.name === 'mark_booking_lead_converted').args), { p_token: token(1), p_booking_id: '11111111-1111-4111-8111-111111111111' });
  const bookingRpc = calls.rpc.find((entry) => entry.name === 'create_booking_transaction').args.payload;
  assert.equal('leadToken' in bookingRpc, false, 'the lead token never enters the booking RPC payload');
  // Without a token nothing is marked.
  const plainRun = loadCreateBookingFunction();
  assert.equal((await plainRun.call(bookingRequest())).status, 201);
  assert.equal(plainRun.calls.rpc.some((entry) => entry.name === 'mark_booking_lead_converted'), false);
  assert.equal((await loadCreateBookingFunction().call(bookingRequest({ leadToken: 'not-a-uuid' }))).status, 400);
});

test('create-booking: a failure while marking the lead is logged without contact data and the booking is still created', async () => {
  for (const options of [{ markError: { code: '42501', message: 'permission denied for ana@example.com' } }, { markThrows: true }]) {
    const { call, calls } = loadCreateBookingFunction(options);
    const response = await call(bookingRequest({ leadToken: token(1) }));
    assert.equal(response.status, 201, 'no rollback: the booking stays valid');
    assert.equal((await response.json()).booking_reference, 'PFT-TEST0001');
    assert.ok(calls.logs.some((entry) => String(entry[0]).includes('Booking lead conversion failed')), 'the failure is logged in a controlled way');
    assert.doesNotMatch(JSON.stringify(calls.logs), /ana@example\.com|Ana Mora|50688881234/);
  }
});

// ---- Browser-side helpers & wiring ---------------------------------------------------------------------------------------------------

function loadLeadUtils(storage) {
  return loadTs('src/utils/bookingLead.ts', vm.createContext({ crypto: globalThis.crypto, sessionStorage: storage, Date, Math, encodeURIComponent, Number }));
}
const memoryStorage = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }; };

const leadInput = (overrides = {}) => ({
  customerName: ' Ana  Mora ', customerEmail: ' Ana@Example.com ', customerWhatsapp: '+50688881234', language: 'es',
  selection: { boatId: 'boat', tourId: 'tour', tourPackageId: 'pkg' }, tourDetailsConfirmed: true,
  tourDetails: { tourDate: '2099-10-01', timeSlotId: 'slot', guests: 4 }, ...overrides,
});

test('lead payload: nothing is built until name, email and WhatsApp are valid; the data is cleaned', () => {
  const utils = loadLeadUtils(memoryStorage());
  for (const overrides of [{ customerName: '' }, { customerName: 'A' }, { customerEmail: '' }, { customerEmail: 'ana@' }, { customerEmail: 'ana@example' }, { customerWhatsapp: '' }, { customerWhatsapp: '12345' }, { customerWhatsapp: '8888 1234' }, { customerWhatsapp: '88881234' }, { customerWhatsapp: '+0123456789' }]) {
    assert.equal(utils.buildBookingLeadPayload(leadInput(overrides)), null);
  }
  const payload = plain(utils.buildBookingLeadPayload(leadInput()));
  assert.deepEqual(payload.customer, { fullName: 'Ana Mora', email: 'ana@example.com', whatsapp: '+50688881234' });
  assert.deepEqual(payload.context, { boatId: 'boat', tourId: 'tour', tourPackageId: 'pkg', tourDate: '2099-10-01', timeSlotId: 'slot', guests: 4 });
  assert.deepEqual(Object.keys(payload).sort(), ['context', 'customer', 'language'], 'no special requests, payment data or anything else');
});

test('lead payload: date, time and guests are only sent when the customer went through the step that shows them', () => {
  const utils = loadLeadUtils(memoryStorage());
  const payload = plain(utils.buildBookingLeadPayload(leadInput({ tourDetailsConfirmed: false })));
  assert.deepEqual(payload.context, { boatId: 'boat', tourId: 'tour', tourPackageId: 'pkg' }, 'technical defaults are never recorded as a choice');
  const panel = fs.readFileSync('src/components/booking/BookingPanel.tsx', 'utf8');
  assert.match(panel, /tourDetailsConfirmed: stepsSeen\.current\.has\(1\)/);
  assert.match(panel, /stepsSeen\.current\.add\(activeStep\)/);
});

test('lead token: stable per session, new after a booking, and it survives blocked storage', () => {
  const storage = memoryStorage();
  const utils = loadLeadUtils(storage);
  const first = utils.getBookingLeadToken();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(utils.getBookingLeadToken(), first);
  utils.resetBookingLeadToken();
  assert.notEqual(utils.getBookingLeadToken(), first);
  const blocked = loadLeadUtils({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
  const inMemory = blocked.getBookingLeadToken();
  assert.equal(blocked.getBookingLeadToken(), inMemory, 'still stable without storage');
  blocked.resetBookingLeadToken();
  assert.notEqual(blocked.getBookingLeadToken(), inMemory);
});

test('booking panel: saves the attempt only on the last step, ~1.5 s after the last change, never twice with the same data, no pagehide', () => {
  const panel = fs.readFileSync('src/components/booking/BookingPanel.tsx', 'utf8');
  const effect = panel.slice(panel.indexOf('const lastSavedLead'), panel.indexOf('}, [activeStep, createdBooking, customerName'));
  assert.match(effect, /activeStep !== 3 \|\| createdBooking \|\| !selectedTour\) return/);
  assert.match(effect, /if \(!payload\) return/);
  assert.match(effect, /key === lastSavedLead\.current\) return/);
  assert.match(effect, /window\.setTimeout\([\s\S]*1500\)/);
  assert.match(effect, /return \(\) => window\.clearTimeout\(timer\)/);
  assert.doesNotMatch(effect, /pagehide|beforeunload|sendBeacon|gtag|dataLayer/);
  assert.match(panel, /leadToken: getBookingLeadToken\(\)/);
  assert.match(panel, /resetBookingLeadToken\(\)/);
  const service = fs.readFileSync('src/services/bookingService.ts', 'utf8');
  assert.match(service, /callFunction<\{ saved: boolean \}>\('save-booking-lead'/);
});

test('abandonment is derived: an open lead is possibly abandoned after 60 minutes without activity', () => {
  const utils = loadLeadUtils(memoryStorage());
  const now = Date.parse('2026-11-24T12:00:00Z');
  const lead = (minutesAgo, status = 'open') => ({ status, updated_at: new Date(now - minutesAgo * 60_000).toISOString() });
  assert.equal(utils.classifyBookingLead(lead(0), now), 'in_progress');
  assert.equal(utils.classifyBookingLead(lead(59), now), 'in_progress');
  assert.equal(utils.classifyBookingLead(lead(60), now), 'abandoned');
  assert.equal(utils.classifyBookingLead(lead(60 * 24 * 3), now), 'abandoned');
  assert.equal(utils.classifyBookingLead(lead(500, 'converted'), now), 'converted');
  assert.equal(utils.LEAD_ABANDONED_AFTER_MINUTES, 60);
  assert.doesNotMatch(LEAD_MIGRATION, /'abandoned'/, 'abandoned is never stored');
});

test('admin links: mailto and WhatsApp use the stored data', () => {
  const utils = loadLeadUtils(memoryStorage());
  const lead = { whatsapp: '+50688881234', full_name: 'Ana Mora', tour_title: 'Fishing Tour', language: 'es', email: 'ana+tours@example.com' };
  assert.equal(utils.buildLeadMailtoUrl(lead.email), 'mailto:ana%2Btours@example.com');
  assert.equal(utils.buildLeadMailtoUrl('  '), null);
  assert.equal(utils.buildLeadMailtoUrl(null), null);
  assert.equal(utils.buildLeadMailtoUrl('a@b.co?bcc=evil@x.com'), 'mailto:a@b.co%3Fbcc%3Devil@x.com', 'cannot inject mail headers');
  const url = new URL(utils.buildLeadWhatsAppUrl(lead));
  assert.equal(url.origin + url.pathname, 'https://wa.me/50688881234', 'wa.me uses exactly the stored international number');
  assert.match(url.searchParams.get('text'), /Ana/);
  assert.match(url.searchParams.get('text'), /Fishing Tour/);
  assert.match(url.searchParams.get('text'), /^¡Hola/);
  assert.equal(new URL(utils.buildLeadWhatsAppUrl({ ...lead, whatsapp: '+13055550100', language: 'en' })).pathname, '/13055550100', 'a US number is not turned into a Costa Rican one');
  assert.match(new URL(utils.buildLeadWhatsAppUrl({ ...lead, whatsapp: '+13055550100', language: 'en' })).searchParams.get('text'), /^Hello Ana/);
  assert.equal(new URL(utils.buildLeadWhatsAppUrl({ ...lead, whatsapp: '+447911123456' })).pathname, '/447911123456');
  // Anything that is not an international number yields NO link: no 506 is ever added by guessing.
  for (const stored of ['88881234', '8888 1234', '506 8888 1234', '00506 8888 1234', '+0123456789', '123', '', null]) {
    assert.equal(utils.buildLeadWhatsAppUrl({ ...lead, whatsapp: stored }), null, `${stored}`);
  }
  assert.equal(utils.normalizeLeadWhatsApp('+50688881234'), '50688881234');
  assert.equal(utils.normalizeLeadWhatsApp('88881234'), '');
});

// ---- International phone capture ---------------------------------------------------------------------------------------------------------

const loadPhone = () => loadTs('src/utils/phoneNumber.ts', vm.createContext({}));
const parsed = (phone, input, country) => plain(phone.parsePhoneNumber(input, country));

test('phone: Costa Rica is the initial prefix and needs exactly 8 digits', () => {
  const phone = loadPhone();
  assert.equal(phone.DEFAULT_PHONE_COUNTRY, 'CR');
  assert.deepEqual(parsed(phone, '8888 1234', 'CR'), { valid: true, e164: '+50688881234', dialCode: '506', national: '88881234', explicit: false });
  assert.equal(parsed(phone, '(506) 8888-1234', 'CR').valid, false, '506 typed inside the number is 11 digits for Costa Rica: asked to fix, never silently kept');
  for (const input of ['8888 123', '888812345', '50688881234']) assert.deepEqual(parsed(phone, input, 'CR'), { valid: false, reason: 'wrong_length', dialCode: '506', expectedLength: 8 });
});

test('phone: another selected prefix is used as chosen, an 8-digit number is never taken for Costa Rica', () => {
  const phone = loadPhone();
  assert.equal(parsed(phone, '305 555 0100', 'US').e164, '+13055550100');
  assert.equal(parsed(phone, '416 555 0100', 'CA').e164, '+14165550100');
  assert.equal(parsed(phone, '7911 123456', 'GB').e164, '+447911123456');
  assert.equal(parsed(phone, '88881234', 'DE').e164, '+4988881234', 'same 8 digits, German prefix chosen: German number');
  assert.equal(parsed(phone, '88881234', 'US').valid, false, 'US needs 10 digits; it is rejected instead of becoming +506');
  assert.equal(parsed(phone, '88881234', 'DE').e164.startsWith('+506'), false);
});

test('phone: an explicit + or 00 is taken as the full international number and wins over the selector', () => {
  const phone = loadPhone();
  assert.deepEqual(parsed(phone, '+44 7911 123456', 'CR'), { valid: true, e164: '+447911123456', dialCode: '', national: '447911123456', explicit: true });
  assert.equal(parsed(phone, '0044 7911 123456', 'CR').e164, '+447911123456');
  assert.equal(parsed(phone, '+1 (305) 555-0100', 'CR').e164, '+13055550100');
  assert.equal(parsed(phone, '+506 8888 8888', 'US').e164, '+50688888888', 'the typed + is respected even if another prefix is selected');
  assert.equal(parsed(phone, '+506 8888 123', 'CR').valid, false, 'an explicit Costa Rican number is length-checked too');
  assert.equal(parsed(phone, '+1 305 555', 'CR').valid, false);
});

test('phone: invalid numbers are rejected with a reason and a customer-facing message', () => {
  const phone = loadPhone();
  assert.equal(parsed(phone, '', 'CR').reason, 'empty');
  assert.equal(parsed(phone, '   ', 'CR').reason, 'empty');
  assert.equal(parsed(phone, 'abc 1234', 'CR').reason, 'invalid_chars');
  assert.equal(parsed(phone, '8888-1234 ext 2', 'CR').reason, 'invalid_chars');
  assert.equal(parsed(phone, '0 8888 1234', 'DE').reason, 'leading_zero');
  assert.equal(parsed(phone, '+0 8888 1234', 'CR').reason, 'leading_zero');
  assert.equal(parsed(phone, '123', 'DE').reason, 'too_short');
  assert.equal(parsed(phone, '1234567890123456', 'DE').reason, 'too_long');
  assert.equal(parsed(phone, '+123456789012345678', 'CR').reason, 'too_long');
  assert.match(phone.phoneErrorMessage(phone.parsePhoneNumber('8888 123', 'CR'), 'es'), /\+506.*8 dígitos.*cambia el prefijo/);
  assert.match(phone.phoneErrorMessage(phone.parsePhoneNumber('8888 123', 'CR'), 'en'), /\+506.*8 digits.*change the prefix/);
  assert.equal(phone.phoneErrorMessage(phone.parsePhoneNumber('8888 1234', 'CR'), 'es'), '');
});

test('phone: every valid result is E.164 and passes the lead rules end to end', () => {
  const phone = loadPhone();
  const utils = loadLeadUtils(memoryStorage());
  for (const [input, country] of [['8888 1234', 'CR'], ['305 555 0100', 'US'], ['7911 123456', 'GB'], ['+34 612 345 678', 'CR'], ['612345678', 'ES']]) {
    const result = parsed(phone, input, country);
    assert.equal(result.valid, true, input);
    assert.match(result.e164, /^\+[1-9]\d{7,14}$/);
    const payload = plain(utils.buildBookingLeadPayload(leadInput({ customerWhatsapp: result.e164 })));
    assert.equal(payload.customer.whatsapp, result.e164);
    assert.equal(utils.normalizeLeadWhatsApp(result.e164), result.e164.slice(1), 'wa.me uses exactly the stored value');
  }
  const options = plain(phone.getPhoneCountryOptions('es'));
  assert.deepEqual(options.slice(0, 3).map((option) => option.iso), ['CR', 'US', 'CA']);
  assert.equal(new Set(options.map((option) => option.iso)).size, options.length);
  assert.match(options[0].label, /^Costa Rica \(\+506\)$/);
});

test('booking panel: the selected prefix, never a guess, builds the number used by the lead and by the booking', () => {
  const panel = fs.readFileSync('src/components/booking/BookingPanel.tsx', 'utf8');
  assert.match(panel, /useState\(DEFAULT_PHONE_COUNTRY\)/);
  assert.match(panel, /parsePhoneNumber\(customerWhatsapp, phoneCountry\)/);
  assert.match(panel, /customerWhatsapp: phone\.valid \? phone\.e164 : ''/);
  assert.match(panel, /whatsapp: phone\.valid \? phone\.e164 : customerWhatsapp/);
  assert.match(panel, /id="booking-phone-country"/);
  assert.doesNotMatch(panel, /'506'|"506"|\+506`|`506/, 'no hard-coded Costa Rica code outside the phone util');
  assert.doesNotMatch(fs.readFileSync('src/utils/bookingLead.ts', 'utf8'), /506/);
});

test('privacy: no analytics call and no contact data in logs on the lead path', () => {
  for (const file of ['src/utils/bookingLead.ts', 'src/components/admin/AdminBookingLeadsSection.tsx', 'supabase/functions/save-booking-lead/index.ts']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /gtag|dataLayer|fbq|ga\(/, file);
    for (const line of source.split('\n').filter((entry) => /console\.(log|warn|error)/.test(entry))) {
      assert.doesNotMatch(line, /fullName|full_name|email|whatsapp|customer/i, `${file}: ${line.trim()}`);
    }
  }
});
