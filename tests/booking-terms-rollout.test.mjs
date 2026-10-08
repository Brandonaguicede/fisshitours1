import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as terms from '../supabase/functions/_shared/terms.mjs';
import { REQUIRE_TERMS_MIGRATION, createBookingDb } from './helpers/booking-db.mjs';

// The rollout, end to end, with the REAL create-booking / admin-create-booking code talking to REAL Postgres (PGlite):
//   A  DB compatible (migration 001)      B  backend compatible      D  new frontend payload      E  enforcement (migration 002)
// There is no phase in which a customer's acceptance is accepted by the site and then dropped.

function edgeOver(db, file) {
  let handler;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role: 'admin', active: true }, error: null }) }),
    rpc: async (name, args) => {
      if (name === 'check_booking_rate_limit') return { data: true, error: null };
      try { return { data: (await db.query('select create_booking_transaction($1::jsonb) as booking', [JSON.stringify(args.payload)])).rows[0].booking, error: null }; }
      catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
    },
  };
  const environment = { SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'srv', DISABLE_TURNSTILE: 'true', RATE_LIMIT_HASH_SECRET: 'x' };
  const context = vm.createContext({ z, console, Response, crypto: globalThis.crypto, TextEncoder, Uint8Array, Deno: { env: { get: (key) => environment[key] } },
    serve: (fn) => { handler = fn; }, withCors: (fn) => fn, corsHeaders: () => ({}), corsPreflight: () => new Response(null), createClient: () => supabase, areExternalProviderMocksAllowed: () => false,
    buildBookingRequestAdminHtml: async () => '', buildBookingRequestCustomerHtml: async () => '', buildBookingRequestSummary: async () => '', fetch: async () => new Response('{}'), ...terms });
  vm.runInContext(ts.transpile(fs.readFileSync(`supabase/functions/${file}/index.ts`, 'utf8').replace(/^import .*;\r?\n/gm, ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return async (body) => { const response = await handler({ method: 'POST', headers: new Headers({ authorization: 'Bearer t', 'cf-connecting-ip': '1.1.1.1' }), json: async () => body }); return { status: response.status, body: await response.json() }; };
}
const web = (date, extra = {}) => ({ customer: { fullName: 'Ana Perez', email: 'ana@example.com', whatsapp: '50688888888' }, boatId: 'boat', tourId: 'tour', tourPackageId: 'pkg', tourDate: date, timeSlotId: 'slot', guests: 4, departureLocationId: '00000000-0000-4000-8000-000000000002', paymentMethodKey: 'paypal', language: 'en', ...extra });
const adminBody = (date, extra = {}) => { const { language, ...rest } = web(date, { paymentMethodKey: 'pay-on-day' }); return { ...rest, ...extra }; };
const stored = async (db, id) => (await db.query('select terms_accepted, terms_version, terms_accepted_via, language, terms_accepted_at is not null as has_time from bookings where id=$1', [id])).rows[0];

test('rollout: with only migration 001 + the compatible backend, the CURRENT site (no terms) keeps booking, and new payloads are persisted properly', async () => {
  const { db } = await createBookingDb({ stage: 'additive' });
  try {
    await db.exec("insert into payment_methods(key,name,type) values ('pay-on-day','Pay on day','manual')");
    const create = edgeOver(db, 'create-booking');
    const admin = edgeOver(db, 'admin-create-booking');
    // Phase A+B: the live site still sends no terms — it must keep working, recorded honestly as "no acceptance".
    const legacy = await create(web('2099-06-01'));
    assert.equal(legacy.status, 201, JSON.stringify(legacy.body));
    assert.deepEqual(await stored(db, legacy.body.booking_id), { terms_accepted: false, terms_version: null, terms_accepted_via: null, language: 'en', has_time: false });
    const legacyAdmin = await admin(adminBody('2099-06-02'));
    assert.equal(legacyAdmin.status, 201);
    assert.equal((await stored(db, legacyAdmin.body.booking_id)).terms_accepted, false);
    // Phase D: the new frontend payload is persisted — nothing is discarded — as soon as the backend is the compatible one.
    const accepted = await create(web('2099-06-03', { termsAccepted: true, termsVersion: 'v1', language: 'es' }));
    assert.equal(accepted.status, 201);
    assert.deepEqual(await stored(db, accepted.body.booking_id), { terms_accepted: true, terms_version: 'v1', terms_accepted_via: 'web', language: 'es', has_time: true });
    const acceptedAdmin = await admin(adminBody('2099-06-04', { termsAccepted: true, language: 'en' }));
    assert.deepEqual(await stored(db, acceptedAdmin.body.booking_id), { terms_accepted: true, terms_version: 'v1', terms_accepted_via: 'admin', language: 'en', has_time: true });
    // Never accepted-then-dropped: an explicit refusal / bad version is rejected, not stored as legacy.
    assert.equal((await create(web('2099-06-05', { termsAccepted: false, termsVersion: 'v1' }))).body.code, 'TERMS_NOT_ACCEPTED');
    assert.equal((await create(web('2099-06-05', { termsAccepted: true, termsVersion: 'v9' }))).body.code, 'TERMS_VERSION_UNKNOWN');
    assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n, 4);
  } finally { await db.close(); }
});

test('rollout phase E: after migration 002 the same functions refuse a request without acceptance with the semantic TERMS_NOT_ACCEPTED (translated from the real database error), and accept the new payload', async () => {
  const { db } = await createBookingDb({ stage: 'additive' });
  try {
    await db.exec("insert into payment_methods(key,name,type) values ('pay-on-day','Pay on day','manual')");
    const create = edgeOver(db, 'create-booking');
    const admin = edgeOver(db, 'admin-create-booking');
    const before = await create(web('2099-05-01'));
    assert.equal(before.status, 201); // transitional booking, created before enforcement
    await db.exec(REQUIRE_TERMS_MIGRATION);
    for (const [call, body] of [[create, web('2099-05-02')], [admin, adminBody('2099-05-02')]]) {
      const response = await call(body); // an old tab / old client: no terms fields → the strict RPC raises, the function translates
      assert.equal(response.status, 400);
      assert.deepEqual(response.body, { message: 'TERMS_NOT_ACCEPTED', code: 'TERMS_NOT_ACCEPTED' });
    }
    assert.equal((await db.query("select count(*)::int n from bookings where tour_date = '2099-05-02'")).rows[0].n, 0, 'nothing was created');
    const ok = await create(web('2099-05-03', { termsAccepted: true, termsVersion: 'v1' }));
    assert.equal(ok.status, 201);
    assert.equal((await stored(db, ok.body.booking_id)).terms_accepted, true);
    assert.equal((await admin(adminBody('2099-05-04', { termsAccepted: true }))).status, 201);
    // The pre-enforcement booking is untouched and still editable, and can never be given an acceptance.
    assert.equal((await stored(db, before.body.booking_id)).terms_accepted, false);
    await db.query("update bookings set booking_status = 'confirmed' where id = $1", [before.body.booking_id]);
  } finally { await db.close(); }
});
