import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRE_TERMS_MIGRATION, TERMS_MIGRATION, bookingPayload, createBookingDb, termsPayload } from './helpers/booking-db.mjs';

const rejects = async (promise, code) => assert.rejects(promise, (error) => { assert.match(String(error.message), new RegExp(code), `expected ${code}, got: ${error.message}`); return true; });
const fresh = async (run) => { const ctx = await createBookingDb(); try { await run(ctx); } finally { await ctx.db.close(); } };
const nextDate = (() => { let day = 0; return () => `2099-11-${String(++day).padStart(2, '0')}`; })();

test('the RPC rejects a booking without accepted terms (TERMS_NOT_ACCEPTED): missing, false, "false" and non-boolean values', () => fresh(async ({ create, db }) => {
  await rejects(create(bookingPayload()), 'TERMS_NOT_ACCEPTED');
  await rejects(create(bookingPayload({ ...termsPayload(), termsAccepted: false })), 'TERMS_NOT_ACCEPTED');
  await rejects(create(bookingPayload({ ...termsPayload(), termsAccepted: 'false' })), 'TERMS_NOT_ACCEPTED');
  await rejects(create(bookingPayload({ ...termsPayload(), termsAccepted: 1 })), 'TERMS_NOT_ACCEPTED');
  assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n, 0, 'nothing was created');
}));

test('an unknown / missing terms version, source or language is rejected', () => fresh(async ({ create }) => {
  for (const termsVersion of ['v2', 'v0', 'V1', '', null, 'v1; drop table bookings']) await rejects(create(bookingPayload({ ...termsPayload(), termsVersion })), 'TERMS_VERSION_UNKNOWN');
  for (const termsAcceptedVia of ['api', 'WEB', '', null]) await rejects(create(bookingPayload({ ...termsPayload(), termsAcceptedVia })), 'TERMS_ACCEPTED_VIA_INVALID');
  await rejects(create(bookingPayload({ ...termsPayload(), language: 'fr' })), 'BOOKING_LANGUAGE_INVALID');
}));

test('acceptance is stored as true + a SERVER timestamp + version + via + language (a client-sent timestamp is ignored)', () => fresh(async ({ create, db }) => {
  const before = Date.now();
  const web = await create(bookingPayload({ ...termsPayload({ language: 'en' }), termsAcceptedAt: '1999-01-01T00:00:00Z', terms_accepted_at: '1999-01-01T00:00:00Z' }));
  const row = (await db.query('select * from bookings where id=$1', [web.booking_id])).rows[0];
  assert.equal(row.terms_accepted, true);
  assert.equal(row.terms_version, 'v1');
  assert.equal(row.terms_accepted_via, 'web');
  assert.equal(row.language, 'en');
  const at = new Date(row.terms_accepted_at).getTime();
  assert.ok(at >= before - 2000 && at <= Date.now() + 2000, `timestamp must be now(), got ${row.terms_accepted_at}`);

  const admin = await create(bookingPayload({ ...termsPayload({ termsAcceptedVia: 'admin' }), tourDate: '2099-10-02' }));
  const adminRow = (await db.query('select terms_accepted_via, language, terms_accepted from bookings where id=$1', [admin.booking_id])).rows[0];
  assert.deepEqual(adminRow, { terms_accepted_via: 'admin', language: 'es', terms_accepted: true });
}));

test('language defaults to es when the payload has none, and only en | es are ever stored', () => fresh(async ({ create, db }) => {
  const { language, ...withoutLanguage } = termsPayload();
  const created = await create(bookingPayload(withoutLanguage));
  assert.equal((await db.query('select language from bookings where id=$1', [created.booking_id])).rows[0].language, 'es');
  await rejects(db.exec("update bookings set language = 'fr'"), 'bookings_language_check');
}));

test('the acceptance is IMMUTABLE once the booking exists (any role, any field); other edits still work', () => fresh(async ({ create, db }) => {
  const { booking_id: id } = await create(bookingPayload(termsPayload()));
  for (const set of ['terms_accepted = false, terms_accepted_at = null, terms_version = null, terms_accepted_via = null', "terms_accepted_via = 'admin'", "terms_accepted_at = now() + interval '1 day'", 'terms_accepted = false']) {
    await rejects(db.query(`update bookings set ${set} where id = $1`, [id]), 'TERMS_ARE_IMMUTABLE');
  }
  const row = (await db.query('select terms_version, terms_accepted_via, terms_accepted from bookings where id=$1', [id])).rows[0];
  assert.deepEqual(row, { terms_version: 'v1', terms_accepted_via: 'web', terms_accepted: true });
  await db.query("update bookings set booking_status = 'confirmed', payment_status = 'paid', language = 'en' where id = $1", [id]);
  assert.equal((await db.query('select booking_status from bookings where id=$1', [id])).rows[0].booking_status, 'confirmed');
}));

test('defense in depth: a direct INSERT without accepted terms is rejected, and the CHECK constraints keep the fields consistent', () => fresh(async ({ create, db }) => {
  const { booking_id: id } = await create(bookingPayload(termsPayload()));
  const base = (await db.query('select * from bookings where id=$1', [id])).rows[0];
  const insert = (overrides) => {
    const row = { ...base, id: crypto.randomUUID(), booking_reference: `PFT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, time_slot_id: 'slot2', tour_date: nextDate(), ...overrides };
    const columns = Object.keys(row);
    return db.query(`insert into bookings (${columns.join(',')}) values (${columns.map((_, index) => `$${index + 1}`).join(',')})`, columns.map((column) => row[column]));
  };
  await rejects(insert({ terms_accepted: false, terms_accepted_at: null, terms_version: null, terms_accepted_via: null }), 'TERMS_NOT_ACCEPTED');
  await rejects(insert({ terms_version: 'v2' }), 'bookings_terms_version_check');
  await rejects(insert({ terms_accepted_via: 'api' }), 'bookings_terms_via_check');
  await rejects(insert({ terms_accepted_at: null }), 'bookings_terms_consistency');
  await insert({});
}));

test('a historical booking keeps "no acceptance recorded" + language es; acceptance can never be added retroactively; the old payload shape no longer creates bookings', async () => {
  const { db, create } = await createBookingDb({ stage: 'none' });
  try {
    const historical = await create(bookingPayload({ tourDate: '2099-09-01' })); // created by the OLD RPC, before terms existed
    await db.exec(TERMS_MIGRATION);
    await db.exec(REQUIRE_TERMS_MIGRATION);
    const row = (await db.query('select terms_accepted, terms_accepted_at, terms_version, terms_accepted_via, language from bookings where id=$1', [historical.booking_id])).rows[0];
    assert.deepEqual(row, { terms_accepted: false, terms_accepted_at: null, terms_version: null, terms_accepted_via: null, language: 'es' });
    await db.query("update bookings set booking_status = 'cancelled' where id=$1", [historical.booking_id]); // still editable
    await rejects(db.query("update bookings set terms_accepted = true, terms_accepted_at = now(), terms_version = 'v1', terms_accepted_via = 'admin' where id=$1", [historical.booking_id]), 'TERMS_ARE_IMMUTABLE');
    await rejects(db.query('update bookings set terms_accepted = true where id=$1', [historical.booking_id]), 'TERMS_ARE_IMMUTABLE');
    await rejects(create(bookingPayload({ tourDate: '2099-09-02' })), 'TERMS_NOT_ACCEPTED');
  } finally { await db.close(); }
});

// --- Rollout: step 1 (additive) must not break clients that do not know about terms; step 2 (mandatory) is applied last. -----------------

test('rollout step 1 (additive only): a client that predates terms still creates a booking — recorded as "no acceptance" — while terms, when sent, are fully validated', async () => {
  const { db, create } = await createBookingDb({ stage: 'additive' });
  try {
    const legacy = await create(bookingPayload({ tourDate: '2099-08-01' })); // exactly what the OLD create-booking / old frontend sends
    const legacyRow = (await db.query('select terms_accepted, terms_accepted_at, terms_version, terms_accepted_via, language from bookings where id=$1', [legacy.booking_id])).rows[0];
    assert.deepEqual(legacyRow, { terms_accepted: false, terms_accepted_at: null, terms_version: null, terms_accepted_via: null, language: 'es' });
    const withLanguage = await create(bookingPayload({ tourDate: '2099-08-02', language: 'en' }));
    assert.equal((await db.query('select language from bookings where id=$1', [withLanguage.booking_id])).rows[0].language, 'en');
    // New clients are recorded properly from step 1 on.
    const accepted = await create(bookingPayload({ ...termsPayload({ language: 'en' }), tourDate: '2099-08-03' }));
    const row = (await db.query('select terms_accepted, terms_version, terms_accepted_via, language, terms_accepted_at is not null as has_time from bookings where id=$1', [accepted.booking_id])).rows[0];
    assert.deepEqual(row, { terms_accepted: true, terms_version: 'v1', terms_accepted_via: 'web', language: 'en', has_time: true });
    // Invalid acceptance is rejected even in the transition; a "false" acceptance never stores a version.
    await rejects(create(bookingPayload({ ...termsPayload({ termsVersion: 'v2' }), tourDate: '2099-08-04' })), 'TERMS_VERSION_UNKNOWN');
    await rejects(create(bookingPayload({ ...termsPayload({ termsAcceptedVia: 'api' }), tourDate: '2099-08-04' })), 'TERMS_ACCEPTED_VIA_INVALID');
    const falseWithVersion = await create(bookingPayload({ ...termsPayload({ termsAccepted: false }), tourDate: '2099-08-05' }));
    assert.equal((await db.query('select terms_version from bookings where id=$1', [falseWithVersion.booking_id])).rows[0].terms_version, null);
    // Immutability already holds, so a transitional booking can never be given an acceptance afterwards.
    await rejects(db.query("update bookings set terms_accepted = true, terms_accepted_at = now(), terms_version = 'v1', terms_accepted_via = 'admin' where id=$1", [legacy.booking_id]), 'TERMS_ARE_IMMUTABLE');
    // No insert guard yet (it comes with step 2): a direct insert of a legacy-shaped row is still possible.
    assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname = 'bookings_require_terms'")).rows[0].n, 0);
  } finally { await db.close(); }
});

test('rollout step 2 (mandatory, applied last): bookings created during the transition stay valid and editable; from then on the old payload is rejected', async () => {
  const { db, create } = await createBookingDb({ stage: 'additive' });
  try {
    const transitional = await create(bookingPayload({ tourDate: '2099-07-01' }));
    await db.exec(REQUIRE_TERMS_MIGRATION);
    const row = (await db.query('select terms_accepted, terms_version from bookings where id=$1', [transitional.booking_id])).rows[0];
    assert.deepEqual(row, { terms_accepted: false, terms_version: null });
    await db.query("update bookings set booking_status = 'confirmed', payment_status = 'paid' where id=$1", [transitional.booking_id]);
    await rejects(create(bookingPayload({ tourDate: '2099-07-02' })), 'TERMS_NOT_ACCEPTED');
    const ok = await create(bookingPayload({ ...termsPayload(), tourDate: '2099-07-02' }));
    assert.ok(ok.booking_id);
    assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname = 'bookings_require_terms'")).rows[0].n, 1);
    // Re-applying either migration is safe (idempotent drops / create or replace) — no second trigger appears.
    await db.exec(REQUIRE_TERMS_MIGRATION);
    assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname = 'bookings_require_terms'")).rows[0].n, 1);
  } finally { await db.close(); }
});
