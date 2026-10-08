import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as terms from '../supabase/functions/_shared/terms.mjs';

// Runs the REAL Edge Function entry points (transpiled, imports stripped) against a fake Supabase to prove the BACKEND, not React, gates the terms.
function load(file, { profile = { role: 'admin', active: true }, env = {}, rpcError = null } = {}) {
  let handler;
  const created = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile, error: null }) }),
    rpc: async (name, args) => {
      if (name === 'check_booking_rate_limit') return { data: true, error: null };
      if (name === 'create_booking_transaction' && rpcError) return { data: null, error: rpcError };
      if (name === 'create_booking_transaction') { created.push(args.payload); return { data: { booking_id: 'b-1', booking_reference: 'PFT-1', booking_status: 'pending_payment', payment_status: 'pending' }, error: null }; }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  const environment = { SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'srv', DISABLE_TURNSTILE: 'true', RATE_LIMIT_HASH_SECRET: 'x', ...env };
  const context = vm.createContext({
    z, console, Response, crypto: globalThis.crypto, TextEncoder, Uint8Array,
    Deno: { env: { get: (key) => environment[key] } },
    serve: (fn) => { handler = fn; }, withCors: (fn) => fn, corsHeaders: () => ({}), corsPreflight: () => new Response(null, { status: 204 }),
    createClient: () => supabase, areExternalProviderMocksAllowed: () => false,
    buildBookingRequestAdminHtml: async () => '', buildBookingRequestCustomerHtml: async () => '', buildBookingRequestSummary: async () => '',
    fetch: async () => new Response('{}'),
    ...terms,
  });
  const source = fs.readFileSync(`supabase/functions/${file}/index.ts`, 'utf8').replace(/^﻿/, '').replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  const call = async (body) => {
    const response = await handler({ method: 'POST', headers: new Headers({ authorization: 'Bearer token', 'cf-connecting-ip': '1.1.1.1' }), json: async () => body });
    return { status: response.status, body: await response.json() };
  };
  return { call, created };
}

const web = (overrides = {}) => ({
  customer: { fullName: 'Ana Perez', email: 'ana@example.com', whatsapp: '50688888888' },
  boatId: 'boat', tourId: 'tour', tourPackageId: 'pkg', tourDate: '2099-10-01', timeSlotId: 'slot', guests: 2,
  departureLocationId: 'loc', paymentMethodKey: 'whatsapp-link', language: 'en', ...overrides,
});
const admin = (overrides = {}) => { const { language, ...base } = web({ paymentMethodKey: 'pay-on-day' }); return { ...base, ...overrides }; };

test('create-booking (web): an explicit refusal, a non-boolean or an incoherent payload is rejected with TERMS_NOT_ACCEPTED and never reaches the database', async () => {
  const bodies = [web({ termsAccepted: false, termsVersion: 'v1' }), web({ termsAccepted: false }), web({ termsVersion: 'v1' }), web({ termsAccepted: null, termsVersion: 'v1' }), web({ termsAccepted: 'true', termsVersion: 'v1' }), web({ termsAccepted: 1, termsVersion: 'v1' })];
  for (const body of bodies) {
    const { call, created } = load('create-booking');
    const response = await call(body);
    assert.equal(response.status, 400, JSON.stringify(body.termsAccepted));
    assert.equal(response.body.code, 'TERMS_NOT_ACCEPTED');
    assert.equal(created.length, 0, 'no booking was created');
  }
});

test('create-booking (web): a LEGACY call with no terms fields still works during the rollout — and NOTHING is invented for it', async () => {
  const { call, created } = load('create-booking');
  const response = await call(web()); // exactly what the old site sends
  assert.equal(response.status, 201);
  assert.equal(created.length, 1);
  for (const key of ['termsAccepted', 'termsVersion', 'termsAcceptedVia', 'termsAcceptedAt']) assert.ok(!(key in created[0]), `${key} must not be invented for a legacy client`);
  assert.equal(created[0].language, 'en', 'the language is still recorded');
});

test('create-booking (web): after migration 002 the database refuses a legacy call and the function answers the same semantic error', async () => {
  const { call, created } = load('create-booking', { rpcError: { message: 'TERMS_NOT_ACCEPTED', code: '22023' } });
  const response = await call(web()); // legacy shape reaches the strict RPC
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { message: 'TERMS_NOT_ACCEPTED', code: 'TERMS_NOT_ACCEPTED' });
  assert.equal(created.length, 0);
  const other = load('create-booking', { rpcError: { message: 'ERROR: TERMS_VERSION_UNKNOWN', code: '22023' } });
  assert.equal((await other.call(web({ termsAccepted: true, termsVersion: 'v1' }))).body.code, 'TERMS_VERSION_UNKNOWN');
  const conflict = load('create-booking', { rpcError: { message: 'BOAT_TIME_CONFLICT', code: 'P0001' } });
  assert.equal((await conflict.call(web())).status, 409, 'non-terms errors keep their mapping');
});

test('create-booking (web): an unknown or missing terms version is rejected', async () => {
  for (const termsVersion of ['v2', 'v0', 'V1', '', 'v1;--', undefined, null]) {
    const { call, created } = load('create-booking');
    const response = await call(web({ termsAccepted: true, termsVersion }));
    assert.equal(response.status, 400, String(termsVersion));
    assert.equal(response.body.code, 'TERMS_VERSION_UNKNOWN');
    assert.equal(created.length, 0);
  }
});

test('create-booking (web): sends termsAccepted + version + via=web + language to the database; client-supplied via / timestamp are ignored', async () => {
  for (const language of ['en', 'es']) {
    const { call, created } = load('create-booking');
    const response = await call(web({ termsAccepted: true, termsVersion: 'v1', language, termsAcceptedVia: 'admin', termsAcceptedAt: '1999-01-01T00:00:00Z', terms_accepted_at: '1999-01-01T00:00:00Z' }));
    assert.equal(response.status, 201);
    assert.equal(created.length, 1);
    assert.equal(created[0].termsAccepted, true);
    assert.equal(created[0].termsVersion, 'v1');
    assert.equal(created[0].termsAcceptedVia, 'web');
    assert.equal(created[0].language, language);
    assert.ok(!('termsAcceptedAt' in created[0]) && !('terms_accepted_at' in created[0]), 'the timestamp is generated by the database');
  }
  const { call, created } = load('create-booking');
  await call(web({ termsAccepted: true, termsVersion: 'v1', language: undefined }));
  assert.equal(created[0].language, 'es', 'default language');
});

test('create-booking (web): an invalid language is rejected', async () => {
  const { call, created } = load('create-booking');
  const response = await call(web({ termsAccepted: true, termsVersion: 'v1', language: 'fr' }));
  assert.equal(response.status, 400);
  assert.equal(created.length, 0);
});

test('admin-create-booking: an explicit refusal is rejected; a confirmation makes the SERVER fix version v1, via=admin and the form language', async () => {
  for (const body of [admin({ termsAccepted: false }), admin({ termsAccepted: null }), admin({ termsAccepted: 'yes' })]) {
    const { call, created } = load('admin-create-booking');
    const response = await call(body);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'TERMS_NOT_ACCEPTED');
    assert.equal(created.length, 0);
  }
  for (const language of ['es', 'en']) {
    const { call, created } = load('admin-create-booking');
    const response = await call(admin({ termsAccepted: true, language, termsVersion: 'v9', termsAcceptedVia: 'web', termsAcceptedAt: '1999-01-01T00:00:00Z' }));
    assert.equal(response.status, 201);
    assert.equal(created[0].termsAccepted, true);
    assert.equal(created[0].termsVersion, 'v1', 'the Admin client cannot choose the version');
    assert.equal(created[0].termsAcceptedVia, 'admin', 'nor the source');
    assert.equal(created[0].language, language);
    assert.ok(!('termsAcceptedAt' in created[0]));
  }
  const { call, created } = load('admin-create-booking');
  await call(admin({ termsAccepted: true }));
  assert.equal(created[0].language, 'es', 'Admin default language is Spanish');
  const invalid = load('admin-create-booking');
  assert.equal((await invalid.call(admin({ termsAccepted: true, language: 'fr' }))).status, 400);
});

test('admin-create-booking: a LEGACY Admin call (no terms field) still works during the rollout and nothing is invented; after 002 the database error is translated', async () => {
  const legacy = load('admin-create-booking');
  const response = await legacy.call(admin());
  assert.equal(response.status, 201);
  for (const key of ['termsAccepted', 'termsVersion', 'termsAcceptedVia']) assert.ok(!(key in legacy.created[0]), `${key} not invented`);
  assert.equal(legacy.created[0].language, 'es');
  const strict = load('admin-create-booking', { rpcError: { message: 'TERMS_NOT_ACCEPTED', code: '22023' } });
  const rejected = await strict.call(admin());
  assert.equal(rejected.status, 400);
  assert.deepEqual(rejected.body, { message: 'TERMS_NOT_ACCEPTED', code: 'TERMS_NOT_ACCEPTED' });
});

test('admin-create-booking still requires an admin / editor session (terms do not bypass authorization)', async () => {
  const { call, created } = load('admin-create-booking', { profile: { role: 'viewer', active: true } });
  const response = await call(admin({ termsAccepted: true }));
  assert.equal(response.status, 403);
  assert.equal(created.length, 0);
});
