// Google Calendar sync of confirmed bookings: event building (title, times in America/Costa_Rica, duration, location, description),
// idempotency (one event per booking), edits on the SAME event, cancelling DELETES the event (no "[CANCELADA]" copy), re-confirming creates it
// again without duplicates, failures that never fail the booking, and the
// authorization of the Edge Function handler. Pure logic against an in-memory Google + database (no network, no real credentials).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { buildEvent, deleteBookingEvent, deleteEvent, eventIdForBooking, handleSyncRequest, localDateTime, resetTokenCache, syncBookingToCalendar, syncConfirmedBookingSafely } from '../supabase/functions/_shared/google-calendar.mjs';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const ENV = { calendarId: 'cal@group.calendar.google.com', email: 'sa@project.iam.gserviceaccount.com', privateKey };
const BOOKING_ID = '11111111-2222-4333-8444-555555555555';

// ---- fakes ---------------------------------------------------------------------------------------------------------------------------

function fakeGoogle() {
  const events = new Map();
  const calls = [];
  // tombstonePatch: what Google answers when a deleted (tombstone) event id is updated: 'revive' brings it back, '404' refuses it.
  const state = { failNext: null, tokenFails: false, deleteBeforePatch: null, tombstonePatch: 'revive' };
  const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target === 'https://oauth2.googleapis.com/token') {
      calls.push({ kind: 'token' });
      return state.tokenFails ? respond(400, { error: 'invalid_grant' }) : respond(200, { access_token: 'fake-access-token', expires_in: 3600 });
    }
    const method = init.method ?? 'GET';
    const match = target.match(/\/events(?:\/([^?]+))?$/);
    const id = match?.[1] ? decodeURIComponent(match[1]) : null;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ kind: 'events', method, id, body, auth: init.headers?.authorization });
    if (state.failNext) { const failure = state.failNext; state.failNext = null; return respond(failure, { error: { message: 'Injected failure' } }); }
    if (method === 'POST') {
      if (events.has(body.id)) return respond(409, { error: { message: 'The requested identifier already exists.' } });
      events.set(body.id, { ...body });
      return respond(200, events.get(body.id));
    }
    if (method === 'PATCH') {
      if (!events.has(id) || events.get(id).deleted) return respond(404, { error: { message: 'Not Found' } });
      if (events.get(id).tombstone) {
        if (state.tombstonePatch === '404') return respond(404, { error: { message: 'Not Found' } });
        events.set(id, { ...body }); // a deleted event comes back to life when it is updated with status confirmed
        return respond(200, events.get(id));
      }
      events.set(id, { ...events.get(id), ...body });
      return respond(200, events.get(id));
    }
    if (method === 'DELETE') {
      if (!events.has(id) || events.get(id).deleted) return respond(404, { error: { message: 'Not Found' } });
      if (events.get(id).tombstone) return respond(410, { error: { message: 'Resource has been deleted' } });
      events.set(id, { ...events.get(id), status: 'cancelled', tombstone: true }); // Google keeps a tombstone: its id can never be inserted again
      return new Response(null, { status: 204 });
    }
    return respond(405, {});
  };
  return { events, calls, state, fetchImpl, eventCalls: () => calls.filter((call) => call.kind === 'events') };
}

const baseBooking = (changes = {}) => ({
  id: BOOKING_ID, booking_reference: 'PFT-000123', booking_status: 'confirmed', payment_status: 'paid', tour_date: '2026-12-01', guests: 4,
  departure_location_name_snapshot: 'Playas del Coco', google_calendar_event_id: null, google_calendar_sync_status: null,
  customers: { full_name: 'Brandon Aguirre', email: 'brandon@example.com', whatsapp: '+506 8888 0000' }, boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' },
  tour_packages: { name: 'Half Day', duration_minutes: 240 }, time_slots: { starts_at: '07:00:00' }, ...changes,
});

function fakeDb({ booking = baseBooking(), profile = { role: 'admin', active: true }, user = { id: 'user-1' } } = {}) {
  const store = { booking, profile, user, updates: [] };
  const from = (table) => {
    const state = { update: null };
    const api = {
      select: () => api,
      eq: () => api,
      update(fields) { state.update = fields; return api; },
      maybeSingle: () => Promise.resolve(table === 'bookings' ? { data: store.booking, error: null } : { data: store.profile, error: null }),
      then(resolve, reject) {
        if (state.update && table === 'bookings') { store.updates.push(state.update); store.booking = { ...store.booking, ...state.update }; }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return api;
  };
  return { db: { from }, store, auth: { getUser: async () => (store.user ? { data: { user: store.user }, error: null } : { data: { user: null }, error: { message: 'bad token' } }) } };
}

const sync = (google, fake, extra = {}) => syncBookingToCalendar({ db: fake.db, env: ENV, fetchImpl: google.fetchImpl, bookingId: BOOKING_ID, ...extra });
const only = (google) => [...google.events.values()].filter((event) => !event.tombstone && !event.deleted); // LIVE events (deleted ones are tombstones)

test.beforeEach(() => resetTokenCache());

// ---- event building ------------------------------------------------------------------------------------------------------------------

test('the event has the tour + customer title, the real departure location, a compact description, and Costa Rica local times', () => {
  const event = buildEvent(baseBooking());
  assert.equal(event.summary, 'Fishing Tour — Brandon Aguirre');
  assert.equal(event.location, 'Playas del Coco');
  assert.deepEqual(event.start, { dateTime: '2026-12-01T07:00:00', timeZone: 'America/Costa_Rica' });
  assert.deepEqual(event.end, { dateTime: '2026-12-01T11:00:00', timeZone: 'America/Costa_Rica' });
  assert.equal(event.description, ['Reserva: PFT-000123', 'Cliente: Brandon Aguirre', 'Email: brandon@example.com', 'WhatsApp: +506 8888 0000', 'Bote: Second Wind', 'Tour: Fishing Tour', 'Paquete: Half Day', 'Personas: 4', 'Pago: Pagado'].join('\n'));
  // V1: nobody is invited and there is no Meet link.
  assert.equal('attendees' in event, false);
  assert.equal('conferenceData' in event, false);
});

test('the end is start + the REAL package duration (also across midnight and for odd durations); a missing duration cannot build an event', () => {
  for (const [minutes, end] of [[60, '2026-12-01T08:00:00'], [90, '2026-12-01T08:30:00'], [480, '2026-12-01T15:00:00'], [3960, '2026-12-04T01:00:00']]) {
    assert.equal(buildEvent(baseBooking({ tour_packages: { name: 'X', duration_minutes: minutes } })).end.dateTime, end, String(minutes));
  }
  assert.equal(localDateTime('2026-12-31', '23:30:00', 60), '2027-01-01T00:30:00');
  for (const duration_minutes of [null, 0, -5]) assert.throws(() => buildEvent(baseBooking({ tour_packages: { name: 'X', duration_minutes } })), /duración válida/);
});

test('there is no "[CANCELADA]" event any more: the title never carries a cancelled mark (a cancelled booking has no event at all)', () => {
  const event = buildEvent(baseBooking({ booking_status: 'cancelled' }), { cancelled: true });
  assert.equal(event.summary, 'Fishing Tour — Brandon Aguirre');
  assert.doesNotMatch(JSON.stringify(event), /CANCELADA/);
});

// ---- create / idempotency ------------------------------------------------------------------------------------------------------------

test('confirming creates the event and stores its id, status synced, sync time and no error', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  const result = await sync(google, fake);
  assert.deepEqual([result.status, result.operation], ['synced', 'create']);
  assert.equal(only(google).length, 1);
  assert.equal(fake.store.booking.google_calendar_event_id, eventIdForBooking(BOOKING_ID));
  assert.equal(fake.store.booking.google_calendar_sync_status, 'synced');
  assert.ok(fake.store.booking.google_calendar_synced_at);
  assert.equal(fake.store.booking.google_calendar_sync_error, null);
  assert.equal(fake.store.updates[0].google_calendar_sync_status, 'pending', 'pending is recorded before Google is called');
  assert.equal(google.eventCalls()[0].auth, 'Bearer fake-access-token');
});

test('a retry, a double click and PARALLEL calls never create a second event', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  await sync(google, fake);
  await sync(google, fake);
  assert.equal(only(google).length, 1, 'sequential retry');
  // Two calls that both saw "no event id yet" (double click): the second POST hits 409 and updates the same event.
  const parallelGoogle = fakeGoogle(); const first = fakeDb(); const second = fakeDb();
  const results = await Promise.all([sync(parallelGoogle, first), sync(parallelGoogle, second)]);
  assert.equal(only(parallelGoogle).length, 1, 'parallel calls');
  assert.deepEqual(results.map((item) => item.status), ['synced', 'synced']);
  assert.equal(first.store.booking.google_calendar_event_id, second.store.booking.google_calendar_event_id);
  // A timeout after Google created the event (id never saved): the retry finds it by its deterministic id.
  const lostGoogle = fakeGoogle(); const lost = fakeDb();
  await sync(lostGoogle, lost);
  lost.store.booking = { ...lost.store.booking, google_calendar_event_id: null, google_calendar_sync_status: 'failed' };
  const retried = await sync(lostGoogle, lost);
  assert.deepEqual([retried.status, retried.operation], ['synced', 'update']);
  assert.equal(only(lostGoogle).length, 1);
});

// ---- edits ---------------------------------------------------------------------------------------------------------------------------

test('editing date, time, location, package or guests updates the SAME event (never a new one) and recomputes start / end / location', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  await sync(google, fake);
  const id = fake.store.booking.google_calendar_event_id;
  const edits = [
    [{ tour_date: '2026-12-05' }, (event) => assert.equal(event.start.dateTime, '2026-12-05T07:00:00')],
    [{ time_slots: { starts_at: '11:30:00' } }, (event) => assert.deepEqual([event.start.dateTime, event.end.dateTime], ['2026-12-05T11:30:00', '2026-12-05T15:30:00'])],
    [{ departure_location_name_snapshot: 'Hermosa' }, (event) => assert.equal(event.location, 'Hermosa')],
    [{ tour_packages: { name: 'Full Day', duration_minutes: 480 } }, (event) => assert.equal(event.end.dateTime, '2026-12-05T19:30:00')],
    [{ guests: 6 }, (event) => assert.match(event.description, /Personas: 6/)],
  ];
  for (const [changes, check] of edits) {
    fake.store.booking = { ...fake.store.booking, ...changes };
    const result = await sync(google, fake);
    assert.deepEqual([result.status, result.operation, result.eventId], ['synced', 'update', id]);
    check(google.events.get(id));
  }
  assert.equal(only(google).length, 1);
});

// ---- cancel / re-confirm -------------------------------------------------------------------------------------------------------------

test('1. confirmed -> the event exists (one live event, id stored)', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  await sync(google, fake);
  assert.equal(only(google).length, 1);
  assert.equal(fake.store.booking.google_calendar_event_id, eventIdForBooking(BOOKING_ID));
});

test('2. confirmed -> cancelled DELETES the event for real (no rename, no [CANCELADA] copy) and settles synced with no event id', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  await sync(google, fake);
  const id = fake.store.booking.google_calendar_event_id;
  fake.store.booking = { ...fake.store.booking, booking_status: 'cancelled' };
  const cancelled = await sync(google, fake);
  assert.deepEqual([cancelled.status, cancelled.operation], ['synced', 'delete']);
  assert.deepEqual(google.eventCalls().filter((call) => call.method === 'DELETE').map((call) => call.id), [id]);
  assert.equal(only(google).length, 0, 'no live event is left');
  assert.ok(![...google.events.values()].some((event) => /CANCELADA/.test(event.summary ?? '')), 'nothing is renamed to [CANCELADA]');
  assert.equal(google.eventCalls().filter((call) => call.method === 'PATCH').length, 0);
  // The booking itself keeps existing (history / audit) and the calendar state is "nothing in the calendar".
  assert.equal(fake.store.booking.booking_status, 'cancelled');
  assert.equal(fake.store.booking.google_calendar_event_id, null);
  assert.equal(fake.store.booking.google_calendar_sync_status, 'synced');
  assert.ok(fake.store.booking.google_calendar_synced_at);
  assert.equal(fake.store.booking.google_calendar_sync_error, null);
  // Syncing it again does nothing (already settled): no second DELETE.
  const callsBefore = google.eventCalls().length;
  const repeated = await sync(google, fake);
  assert.equal(repeated.status, 'skipped');
  assert.equal(google.eventCalls().length, callsBefore);
});

test('3. DELETE answering 404 / 410 (already deleted by hand) counts as success: the booking settles synced with no event id', async () => {
  for (const status of [404, 410]) {
    const google = fakeGoogle(); const fake = fakeDb();
    await sync(google, fake);
    fake.store.booking = { ...fake.store.booking, booking_status: 'cancelled' };
    // The event vanished from Google before the cancellation: the DELETE finds nothing (404) or a tombstone (410).
    const eventId = fake.store.booking.google_calendar_event_id;
    google.events.clear();
    if (status === 410) google.events.set(eventId, { tombstone: true });
    const result = await sync(google, fake);
    assert.deepEqual([result.status, result.operation], ['synced', 'delete'], String(status));
    assert.equal(fake.store.booking.google_calendar_sync_status, 'synced');
    assert.equal(fake.store.booking.google_calendar_event_id, null);
    assert.equal(fake.store.booking.google_calendar_sync_error, null);
  }
});

test('4. a real DELETE error never un-cancels the booking: it stays cancelled, Calendar is failed with the event id kept, and Reintentar deletes it', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  await sync(google, fake);
  const id = fake.store.booking.google_calendar_event_id;
  fake.store.booking = { ...fake.store.booking, booking_status: 'cancelled' };
  // Fail only the first DELETE.
  let failures = 1;
  const flaky = async (url, init = {}) => (init.method === 'DELETE' && failures-- > 0 ? new Response(JSON.stringify({ error: { message: 'Backend Error' } }), { status: 500 }) : google.fetchImpl(url, init));
  const failed = await syncBookingToCalendar({ db: fake.db, env: ENV, fetchImpl: flaky, bookingId: BOOKING_ID });
  assert.equal(failed.status, 'failed');
  assert.equal(fake.store.booking.booking_status, 'cancelled', 'the cancellation is never reverted');
  assert.equal(fake.store.booking.google_calendar_sync_status, 'failed');
  assert.match(fake.store.booking.google_calendar_sync_error, /Google Calendar respondió 500/);
  assert.equal(fake.store.booking.google_calendar_event_id, id, 'the id is kept so the delete can be retried');
  assert.equal(only(google).length, 1, 'the event is still there');
  const retried = await sync(google, fake);
  assert.deepEqual([retried.status, retried.operation], ['synced', 'delete']);
  assert.equal(only(google).length, 0);
  assert.equal(fake.store.booking.google_calendar_event_id, null);
  assert.equal(fake.store.booking.google_calendar_sync_error, null, 'the error is cleared on success');
  // Rejected credentials while deleting are failed too, never a thrown error.
  const authGoogle = fakeGoogle(); const authFake = fakeDb({ booking: baseBooking({ booking_status: 'cancelled', google_calendar_event_id: 'evt', google_calendar_sync_status: 'synced' }) });
  authGoogle.state.tokenFails = true;
  resetTokenCache(); // the access token of the previous calls is cached in the isolate
  assert.equal((await sync(authGoogle, authFake)).status, 'failed');
  assert.equal(authFake.store.booking.booking_status, 'cancelled');
  assert.match(authFake.store.booking.google_calendar_sync_error, /rechazó la autenticación/);
});

test('a cancelled booking whose create never saved its id (sync pending / failed, no event id) still has its event deleted by the derived id', async () => {
  for (const syncStatus of ['pending', 'failed']) {
    const google = fakeGoogle(); const fake = fakeDb();
    await sync(google, fake); // Google created the event ...
    fake.store.booking = { ...fake.store.booking, booking_status: 'cancelled', google_calendar_event_id: null, google_calendar_sync_status: syncStatus }; // ... but the id was lost
    const result = await sync(google, fake);
    assert.deepEqual([result.status, result.operation], ['synced', 'delete'], syncStatus);
    assert.equal(only(google).length, 0, syncStatus);
  }
});

for (const tombstonePatch of ['revive', '404']) {
  test(`6/8. re-confirming a cancelled booking creates its event again and never duplicates it (Google ${tombstonePatch === 'revive' ? 'revives the deleted id' : 'refuses the deleted id: a fresh one is used'})`, async () => {
    const google = fakeGoogle(); const fake = fakeDb();
    google.state.tombstonePatch = tombstonePatch;
    await sync(google, fake);
    fake.store.booking = { ...fake.store.booking, booking_status: 'cancelled' };
    await sync(google, fake);
    assert.equal(only(google).length, 0);
    // Confirmed again (the database trigger puts the calendar state back to pending, and the event id is still null).
    fake.store.booking = { ...fake.store.booking, booking_status: 'confirmed', google_calendar_sync_status: 'pending' };
    const again = await sync(google, fake);
    assert.equal(again.status, 'synced');
    assert.equal(only(google).length, 1, 'exactly one live event');
    assert.equal(only(google)[0].summary, 'Fishing Tour — Brandon Aguirre');
    assert.equal(fake.store.booking.google_calendar_event_id, again.eventId);
    // Retries, a double click or the PayPal webhook arriving later never add a second one.
    await sync(google, fake);
    await Promise.all([sync(google, fake), sync(google, fake)]);
    const webhook = await syncConfirmedBookingSafely({ db: fake.db, env: ENV, fetchImpl: google.fetchImpl, bookingId: BOOKING_ID });
    assert.equal(webhook.status, 'skipped');
    assert.equal(only(google).length, 1, 'still exactly one live event');
  });
}

test('7. a re-confirmation that the database rejects (slot taken by another booking) leaves the booking cancelled: the sync does nothing and no event appears', async () => {
  // The availability guard itself (BOAT_TIME_CONFLICT) is exercised on a real Postgres in booking-edit-slots.test.mjs; here the consequence for Calendar.
  const google = fakeGoogle(); const fake = fakeDb();
  await sync(google, fake);
  fake.store.booking = { ...fake.store.booking, booking_status: 'cancelled' };
  await sync(google, fake); // cancelled and cleaned
  const calls = google.eventCalls().length;
  const result = await sync(google, fake); // the Admin still runs a sync after the failed confirm attempt
  assert.equal(result.status, 'skipped');
  assert.equal(google.eventCalls().length, calls, 'Google is not touched');
  assert.equal(only(google).length, 0);
  assert.equal(fake.store.booking.booking_status, 'cancelled');
});

test('9. hard delete: deleteBookingEvent removes the event (idempotent) and reports failed so the caller does NOT delete the row', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  await sync(google, fake);
  const eventId = fake.store.booking.google_calendar_event_id;
  const deleted = await deleteBookingEvent({ env: ENV, fetchImpl: google.fetchImpl, eventId, bookingId: BOOKING_ID });
  assert.equal(deleted.status, 'deleted');
  assert.equal(only(google).length, 0);
  assert.equal((await deleteBookingEvent({ env: ENV, fetchImpl: google.fetchImpl, eventId, bookingId: BOOKING_ID })).status, 'already_gone', 'a second call is a no-op success (410)');
  assert.equal((await deleteBookingEvent({ env: ENV, fetchImpl: google.fetchImpl, eventId: 'never-existed', bookingId: BOOKING_ID })).status, 'already_gone', '404');
  assert.equal((await deleteBookingEvent({ env: ENV, fetchImpl: google.fetchImpl, eventId: null, bookingId: BOOKING_ID })).status, 'skipped', 'no event, nothing to do');
  const second = fakeGoogle(); const other = fakeDb();
  await sync(second, other);
  const broken = async (url, init = {}) => (init.method === 'DELETE' ? new Response('{}', { status: 503 }) : second.fetchImpl(url, init));
  const failed = await deleteBookingEvent({ env: ENV, fetchImpl: broken, eventId: other.store.booking.google_calendar_event_id, bookingId: BOOKING_ID });
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /Google Calendar respondió 503/);
  assert.equal(only(second).length, 1, 'the event is untouched, so the booking must not be removed yet');
  // The low-level helper returns the outcome and throws on anything else.
  await assert.rejects(() => deleteEvent(ENV, 'fake-access-token', 'x', async () => new Response('{}', { status: 403 })), /Google Calendar respondió 403/);
});

test('pending bookings (and cancelled ones that never had an event) are skipped: no Google call at all', async () => {
  for (const booking of [baseBooking({ booking_status: 'pending' }), baseBooking({ booking_status: 'pending_payment' }), baseBooking({ booking_status: 'cancelled' })]) {
    const google = fakeGoogle(); const fake = fakeDb({ booking });
    const result = await sync(google, fake);
    assert.equal(result.status, 'skipped');
    assert.equal(google.calls.length, 0);
    assert.deepEqual(fake.store.updates, []);
  }
});

test('an event that was deleted by hand in Google is recreated (still one live event) instead of failing forever', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  await sync(google, fake);
  const oldId = fake.store.booking.google_calendar_event_id;
  google.events.get(oldId).deleted = true;
  const result = await sync(google, fake);
  assert.deepEqual([result.status, result.operation], ['synced', 'create']);
  assert.notEqual(fake.store.booking.google_calendar_event_id, oldId);
});

// ---- failures ------------------------------------------------------------------------------------------------------------------------

test('Google failing NEVER fails the booking: it stays confirmed, sync is failed with a safe message, and a retry turns it into synced', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  google.state.failNext = 500;
  const failed = await sync(google, fake);
  assert.equal(failed.status, 'failed');
  assert.equal(fake.store.booking.booking_status, 'confirmed');
  assert.equal(fake.store.booking.google_calendar_sync_status, 'failed');
  assert.match(fake.store.booking.google_calendar_sync_error, /Google Calendar respondió 500/);
  assert.equal(fake.store.booking.google_calendar_event_id, null);
  const retried = await sync(google, fake);
  assert.deepEqual([retried.status, retried.operation], ['synced', 'create']);
  assert.equal(fake.store.booking.google_calendar_sync_status, 'synced');
  assert.equal(fake.store.booking.google_calendar_sync_error, null, 'the error is cleared on success');
  assert.equal(only(google).length, 1);
});

test('rejected credentials and a missing duration are recorded as failed too (no invalid event is ever sent)', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  google.state.tokenFails = true;
  assert.equal((await sync(google, fake)).status, 'failed');
  assert.match(fake.store.booking.google_calendar_sync_error, /rechazó la autenticación/);
  assert.equal(fake.store.booking.booking_status, 'confirmed');

  const noDuration = fakeGoogle(); const bad = fakeDb({ booking: baseBooking({ tour_packages: { name: 'Legacy', duration_minutes: null } }) });
  const result = await sync(noDuration, bad);
  assert.equal(result.status, 'failed');
  assert.match(bad.store.booking.google_calendar_sync_error, /duración válida/);
  assert.equal(noDuration.eventCalls().length, 0, 'nothing invalid reaches Google');
  assert.equal(bad.store.booking.booking_status, 'confirmed');
});

test('logs and stored errors never contain the private key, the JWT or the access token', async () => {
  const logs = []; const google = fakeGoogle(); const fake = fakeDb();
  google.state.failNext = 403;
  await sync(google, fake, { log: (...args) => logs.push(JSON.stringify(args)) });
  await sync(google, fake, { log: (...args) => logs.push(JSON.stringify(args)) });
  const everything = `${logs.join('\n')}\n${JSON.stringify(fake.store.updates)}`;
  for (const secret of ['BEGIN PRIVATE KEY', 'fake-access-token', 'eyJ']) assert.equal(everything.includes(secret), false, secret);
  assert.ok(logs.some((line) => line.includes(BOOKING_ID)), 'the booking id is logged for diagnosis');
});

// ---- Edge Function handler: authorization --------------------------------------------------------------------------------------------

function handler(fake, google, extraEnv = {}) {
  const environment = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', GOOGLE_CALENDAR_ID: ENV.calendarId, GOOGLE_SERVICE_ACCOUNT_EMAIL: ENV.email, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: ENV.privateKey, ...extraEnv };
  const createClient = (_url, key) => (key === 'service' ? fake.db : { auth: fake.auth });
  return (request) => handleSyncRequest(request, { createClient, env: (name) => environment[name], fetchImpl: google.fetchImpl }, {});
}
const post = (body, token = 'valid') => new Request('https://f/sync-reservation-calendar', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

test('the function requires a session: no token or an invalid one is 401 and Google is never called', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  const run = handler(fake, google);
  assert.equal((await run(post({ reservationId: BOOKING_ID }, null))).status, 401);
  fake.store.user = null;
  assert.equal((await run(post({ reservationId: BOOKING_ID }))).status, 401);
  assert.equal(google.calls.length, 0);
});

test('only an active admin / editor may sync: viewers, inactive profiles and users without a profile are 403', async () => {
  for (const profile of [{ role: 'viewer', active: true }, { role: 'admin', active: false }, null, { role: 'customer', active: true }]) {
    const google = fakeGoogle(); const fake = fakeDb({ profile });
    const response = await handler(fake, google)(post({ reservationId: BOOKING_ID }));
    assert.equal(response.status, 403, JSON.stringify(profile));
    assert.equal(google.calls.length, 0);
  }
  for (const role of ['admin', 'editor']) {
    const google = fakeGoogle(); const fake = fakeDb({ profile: { role, active: true } });
    const response = await handler(fake, google)(post({ reservationId: BOOKING_ID }));
    assert.equal(response.status, 200, role);
    assert.equal((await response.json()).status, 'synced');
  }
});

test('the body carries only the reservation id: anything else is ignored, a bad id is 400, and no secret is ever returned', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  const run = handler(fake, google);
  assert.equal((await run(post({ reservationId: 'not-a-uuid' }))).status, 400);
  assert.equal((await run(post({}))).status, 400);
  // Commercial data sent by the client is NOT used: the event comes from the database.
  const response = await run(post({ reservationId: BOOKING_ID, title: 'Hacked', price: 1, customer: { full_name: 'Someone Else' } }));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(only(google)[0].summary, 'Fishing Tour — Brandon Aguirre');
  for (const secret of ['BEGIN PRIVATE KEY', 'fake-access-token', 'service', 'anon']) assert.equal(text.includes(secret), false, secret);
  const missing = await handler(fakeDb({ booking: null }), google)(post({ reservationId: BOOKING_ID }));
  assert.equal(missing.status, 404);
  assert.equal((await handler(fake, google)(new Request('https://f/x', { method: 'GET' }))).status, 405);
});

test('a Google failure inside the handler is still HTTP 200 with status failed (the Admin shows "No sincronizada"), not a server error', async () => {
  const google = fakeGoogle(); const fake = fakeDb();
  google.state.failNext = 500;
  const response = await handler(fake, google)(post({ reservationId: BOOKING_ID }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'failed');
  assert.equal(fake.store.booking.booking_status, 'confirmed');
});

// ---- automatic confirmations (PayPal capture / webhook) ---------------------------------------------------------------------------------

const auto = (google, fake, extra = {}) => syncConfirmedBookingSafely({ db: fake.db, env: ENV, fetchImpl: google.fetchImpl, bookingId: BOOKING_ID, ...extra });
// What the database does when a payment flow confirms a booking (trigger mark_calendar_pending_on_confirm).
const paidByPayPal = (changes = {}) => baseBooking({ google_calendar_sync_status: 'pending', ...changes });

test('PayPal capture confirming a booking creates its Calendar event through the SAME sync as the Admin (one event, event id stored, synced)', async () => {
  const google = fakeGoogle(); const fake = fakeDb({ booking: paidByPayPal() });
  const result = await auto(google, fake);
  assert.deepEqual([result.status, result.operation], ['synced', 'create']);
  assert.equal(only(google).length, 1);
  assert.equal(fake.store.booking.google_calendar_event_id, eventIdForBooking(BOOKING_ID));
  assert.equal(fake.store.booking.google_calendar_sync_status, 'synced');
  assert.equal(fake.store.booking.booking_status, 'confirmed');
  assert.equal(only(google)[0].summary, 'Fishing Tour — Brandon Aguirre');
});

test('capture + webhook + retries for the same reservation give ONE event: sequential repeats do not even call Google, parallel ones converge', async () => {
  const google = fakeGoogle(); const fake = fakeDb({ booking: paidByPayPal() });
  await auto(google, fake); // capture
  const callsAfterCapture = google.eventCalls().length;
  const webhook = await auto(google, fake); // webhook
  const repeated = await Promise.all([auto(google, fake), auto(google, fake), auto(google, fake)]); // webhook retries
  assert.equal(webhook.status, 'skipped');
  assert.ok(repeated.every((item) => item.status === 'skipped'));
  assert.equal(google.eventCalls().length, callsAfterCapture, 'an already synced booking is not sent to Google again');
  assert.equal(only(google).length, 1);
  // Capture and webhook arriving AT THE SAME TIME (both see "pending"): still one event.
  const raceGoogle = fakeGoogle(); const captureSide = fakeDb({ booking: paidByPayPal() }); const webhookSide = fakeDb({ booking: paidByPayPal() });
  const results = await Promise.all([auto(raceGoogle, captureSide), auto(raceGoogle, webhookSide)]);
  assert.equal(only(raceGoogle).length, 1);
  assert.ok(results.every((item) => item.status === 'synced'));
  assert.equal(captureSide.store.booking.google_calendar_event_id, webhookSide.store.booking.google_calendar_event_id);
});

test('Calendar failing after a PayPal confirmation never fails the payment: nothing is thrown, the booking stays confirmed and paid, sync is failed, and a later retry reaches synced', async () => {
  const google = fakeGoogle(); const fake = fakeDb({ booking: paidByPayPal() });
  google.state.failNext = 500;
  const result = await auto(google, fake);
  assert.equal(result.status, 'failed');
  assert.equal(fake.store.booking.booking_status, 'confirmed');
  assert.equal(fake.store.booking.payment_status, 'paid');
  assert.equal(fake.store.booking.google_calendar_sync_status, 'failed');
  assert.match(fake.store.booking.google_calendar_sync_error, /Google Calendar respondió 500/);
  // The Admin "Reintentar" (or the next webhook retry) settles it.
  const retried = await sync(google, fake);
  assert.deepEqual([retried.status, retried.operation], ['synced', 'create']);
  assert.equal(fake.store.booking.google_calendar_sync_status, 'synced');
  assert.equal(only(google).length, 1);
});

test('even if the database or the network blows up, the automatic sync only reports failed: it never throws into the payment flow and returns no Google detail to expose', async () => {
  const boom = { from: () => { throw new Error('db down'); } };
  const result = await syncConfirmedBookingSafely({ db: boom, env: ENV, fetchImpl: fakeGoogle().fetchImpl, bookingId: BOOKING_ID });
  assert.equal(result.status, 'failed');
  const google = fakeGoogle(); const fake = fakeDb({ booking: paidByPayPal() });
  google.state.tokenFails = true;
  const failed = await auto(google, fake);
  assert.equal(failed.status, 'failed');
  assert.doesNotMatch(JSON.stringify(failed), /BEGIN PRIVATE KEY|fake-access-token|eyJ/);
});

test('cancelling after the automatic confirmation deletes the event (a late PayPal webhook retry does not bring it back)', async () => {
  const google = fakeGoogle(); const fake = fakeDb({ booking: paidByPayPal() });
  await auto(google, fake);
  fake.store.booking = { ...fake.store.booking, booking_status: 'cancelled' };
  const cancelled = await sync(google, fake);
  assert.deepEqual([cancelled.status, cancelled.operation], ['synced', 'delete']);
  assert.equal(only(google).length, 0);
  const webhookRetry = await auto(google, fake);
  assert.equal(webhookRetry.status, 'skipped');
  assert.equal(only(google).length, 0, 'a cancelled booking never gets its event back from an automatic flow');
});

test('a NEW booking on the slot of a cancelled one gets its own event (the cancelled one has none)', async () => {
  const google = fakeGoogle(); const fake = fakeDb({ booking: paidByPayPal() });
  await auto(google, fake);
  fake.store.booking = { ...fake.store.booking, booking_status: 'cancelled' };
  await sync(google, fake);
  const otherId = '99999999-2222-4333-8444-555555555555';
  const other = fakeDb({ booking: paidByPayPal({ id: otherId, booking_reference: 'PFT-000124', customers: { full_name: 'Nueva Persona', email: 'n@example.com', whatsapp: '1' } }) });
  const result = await syncConfirmedBookingSafely({ db: other.db, env: ENV, fetchImpl: google.fetchImpl, bookingId: otherId });
  assert.equal(result.status, 'synced');
  assert.equal(only(google).length, 1);
  assert.deepEqual(only(google).map((event) => event.summary), ['Fishing Tour — Nueva Persona']);
});
