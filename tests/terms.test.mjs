import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { ALLOW_LEGACY_CLIENTS_WITHOUT_TERMS, CURRENT_TERMS_VERSION, TERMS_LANGUAGES, TERMS_VERSIONS, checkTermsAcceptance, getTerms, isKnownTermsVersion, renderTermsText } from '../supabase/functions/_shared/terms.mjs';

// v1 is the client's own commercial document: if you must change the policies, publish v2 (and a migration extending the CHECK) — never edit v1.
// This pin makes an accidental edit fail loudly.
const V1_SHA256 = '607ee52c4c877846edbd17b601df6b13afa52f1ae85fc97dbd2abe05f6521ac7';

test('v1 is the current version and has the five sections, each item written in BOTH languages', () => {
  assert.equal(CURRENT_TERMS_VERSION, 'v1');
  assert.deepEqual(Object.keys(TERMS_VERSIONS), ['v1']);
  assert.deepEqual(TERMS_VERSIONS.v1.sections.map((section) => section.id), ['reservations-payments', 'change-cancellation', 'weather', 'arrival', 'responsibilities', 'privacy']);
  for (const section of TERMS_VERSIONS.v1.sections) {
    for (const language of TERMS_LANGUAGES) assert.ok(section.title[language]?.trim(), `${section.id} title ${language}`);
    assert.ok(section.items.length > 0);
    for (const item of section.items) for (const language of TERMS_LANGUAGES) assert.ok(item[language]?.trim(), `${section.id} item ${language}`);
  }
  for (const language of TERMS_LANGUAGES) assert.equal(getTerms('v1', language).sections.length, 6);
});

test("the client's cancellation rules are kept AS WRITTEN, overlap included (nothing reinterpreted to 72h / 24h ranges)", () => {
  const en = getTerms('v1', 'en').sections.find((section) => section.id === 'change-cancellation').items;
  assert.equal(en.length, 5);
  assert.match(en[0], /^Cancellations 3 days before the tour date: You may cancel your tour without penalty up to 3 days before the tour and receive a 100% refund\.$/);
  assert.match(en[1], /^Cancellations within 3 days of the tour date: A 30% penalty will apply due to operational losses\/boat rental costs\.$/);
  assert.match(en[2], /^Rescheduling within 3 days of the tour: You may reschedule your tour to a different available date, subject to availability\.$/);
  assert.match(en[3], /^Cancellations with full penalty: If you cancel within 24 hours of the tour, a 100% penalty will apply due to operational\/boat rental costs, food, and beverage services\.$/);
  assert.match(en[4], /^If the client or their companions fail to show up for the tour, the deposit will not be refunded\.$/);
  const es = getTerms('v1', 'es').sections.find((section) => section.id === 'change-cancellation').items;
  assert.match(es[0], /^Cancelaciones 3 días antes de la fecha del tour: .* reembolso del 100%\.$/);
  assert.match(es[1], /^Cancelaciones dentro de los 3 días de la fecha del tour: .* penalización del 30%/);
  assert.match(es[3], /dentro de las 24 horas anteriores al tour, se aplicará una penalización del 100%/);
  assert.ok(!/72/.test(JSON.stringify(TERMS_VERSIONS)), 'no 72h reinterpretation');
});

test('payments section no longer carries the deposit / balance / payment-methods / PayPal lines (Pay on the Day is going away); only the fees line is left', () => {
  const en = getTerms('v1', 'en').sections[0];
  const es = getTerms('v1', 'es').sections[0];
  assert.deepEqual(en.items, ['Bank transfer/PayPal fees will be covered by the client.']);
  assert.deepEqual(es.items, ['Las comisiones de transferencia bancaria o PayPal serán cubiertas por el cliente.']);
  const all = JSON.stringify(TERMS_VERSIONS.v1);
  for (const removed of ['50% deposit', 'depósito del 50%', 'remaining balance', 'saldo restante', 'Payment methods:', 'Métodos de pago:', 'SINPE', 'safe and easy', 'segura y sencilla', 'To secure your reservation', 'Para asegurar la reserva']) assert.ok(!all.includes(removed), `"${removed}" was removed from v1`);
});

test('privacy section: title and the 7 clauses exist in EN and ES, exactly as provided', () => {
  const en = getTerms('v1', 'en').sections.find((section) => section.id === 'privacy');
  const es = getTerms('v1', 'es').sections.find((section) => section.id === 'privacy');
  assert.equal(en.title, 'Privacy and Use of Personal Data');
  assert.equal(es.title, 'Privacidad y uso de datos personales');
  assert.equal(en.items.length, 7);
  assert.equal(es.items.length, 7);
  assert.equal(en.items[3], 'Personal information will not be sold to third parties for advertising or commercial purposes.');
  assert.equal(es.items[3], 'Los datos personales no serán vendidos a terceros con fines publicitarios o comerciales.');
  assert.match(en.items[0], /^Personal information provided during the booking process, such as your name, email address, phone or WhatsApp number, booking details, and special requests, will be used only to manage your reservation/);
  assert.match(es.items[0], /^Los datos personales proporcionados durante el proceso de reserva, como nombre, correo electrónico, número de teléfono o WhatsApp/);
  assert.match(en.items[6], /^Special requests submitted during the booking process should be limited to information necessary/);
  assert.match(es.items[6], /^Las solicitudes especiales ingresadas durante la reserva deben limitarse a información necesaria/);
});

test('v1 content is frozen: its hash is pinned (a change must be a NEW version)', () => {
  const hash = crypto.createHash('sha256').update(JSON.stringify(TERMS_VERSIONS.v1)).digest('hex');
  assert.equal(hash, V1_SHA256, `v1 text changed. If this is intentional it must be published as v2. New hash: ${hash}`);
  assert.ok(Object.isFrozen(TERMS_VERSIONS) && Object.isFrozen(TERMS_VERSIONS.v1) && Object.isFrozen(TERMS_VERSIONS.v1.sections[0].items[0]));
  assert.throws(() => { TERMS_VERSIONS.v1.sections[0].items[0].en = 'changed'; }, TypeError);
});

test('getTerms never falls back: unknown version / language throw, and a later v2 does not touch v1', () => {
  for (const version of ['v2', '', null, undefined, 'V1', 'v1 ']) assert.throws(() => getTerms(version, 'en'), /Unknown terms version/);
  assert.throws(() => getTerms('v1', 'fr'), /Unsupported terms language/);
  assert.equal(isKnownTermsVersion('v1'), true);
  assert.equal(isKnownTermsVersion('v2'), false);
  const registry = { ...TERMS_VERSIONS, v2: { version: 'v2', sections: [{ id: 'new', title: { en: 'NEW', es: 'NUEVO' }, items: [{ en: 'only in v2', es: 'solo en v2' }] }] } };
  assert.equal(getTerms('v1', 'en', registry).sections.length, 6);
  assert.deepEqual(getTerms('v1', 'en', registry), getTerms('v1', 'en'));
  assert.equal(getTerms('v2', 'es', registry).sections[0].items[0], 'solo en v2');
  assert.ok(!renderTermsText('v1', 'en', registry).includes('only in v2'));
});

test('renderTermsText prints heading + version + every section and bullet in the requested language', () => {
  const en = renderTermsText('v1', 'en');
  assert.match(en, /^Terms and Conditions\n/);
  assert.doesNotMatch(en + renderTermsText('v1', 'es'), /\(v1\)|\bv1\b/, 'the version is internal, never printed');
  assert.match(en, /Weather-related Cancellation Policies\n- A refund or rescheduling will be offered only when weather conditions are beyond human control/);
  const es = renderTermsText('v1', 'es');
  assert.match(es, /^Términos y Condiciones\n/);
  assert.match(es, /Políticas de cancelación por clima\n- Se ofrecerá reembolso o reprogramación únicamente/);
  assert.equal(en.split('\n- ').length - 1, 1 + 5 + 2 + 4 + 2 + 7);
});

test('checkTermsAcceptance: accepted+current version, or a legacy client with NO terms fields (rollout switch); everything else is rejected with a semantic code', () => {
  assert.deepEqual(checkTermsAcceptance({ termsAccepted: true, termsVersion: 'v1' }), { ok: true, termsVersion: 'v1' });
  // Rollout phase: a client that predates the checkbox sends nothing about terms. It passes, flagged legacy — acceptance is never invented.
  assert.equal(ALLOW_LEGACY_CLIENTS_WITHOUT_TERMS, true);
  assert.deepEqual(checkTermsAcceptance({}), { ok: true, legacy: true });
  assert.deepEqual(checkTermsAcceptance({ termsAccepted: undefined, termsVersion: undefined }), { ok: true, legacy: true });
  // Explicit refusal / non-boolean / incoherent payloads are NEVER legacy.
  for (const termsAccepted of [false, 'true', 1, null, 0, '']) assert.deepEqual(checkTermsAcceptance({ termsAccepted, termsVersion: 'v1' }), { ok: false, status: 400, code: 'TERMS_NOT_ACCEPTED' }, String(termsAccepted));
  assert.deepEqual(checkTermsAcceptance({ termsAccepted: false }), { ok: false, status: 400, code: 'TERMS_NOT_ACCEPTED' });
  assert.deepEqual(checkTermsAcceptance({ termsVersion: 'v1' }), { ok: false, status: 400, code: 'TERMS_NOT_ACCEPTED' }, 'a version without an acceptance is incoherent');
  for (const termsVersion of [undefined, null, 'v2', 'v1; select 1', '', 'V1']) assert.deepEqual(checkTermsAcceptance({ termsAccepted: true, termsVersion }), { ok: false, status: 400, code: 'TERMS_VERSION_UNKNOWN' }, String(termsVersion));
  // With the switch off (after the cleanup that follows migration 002) a request without terms is rejected too.
  assert.deepEqual(checkTermsAcceptance({}, { allowLegacy: false }), { ok: false, status: 400, code: 'TERMS_NOT_ACCEPTED' });
});
