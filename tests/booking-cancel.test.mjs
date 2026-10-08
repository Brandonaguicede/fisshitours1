// Cancelling a booking from the Admin is ONE server-side request (admin-cancel-booking): it cancels through update_booking_status (the
// trigger releases the availability block), then deletes the Google Calendar event, and answers after that attempt. The browser never
// makes a second call, so closing the tab cannot leave a cancelled booking with a live event. A Google problem never reverts the
// cancellation: it stays cancelled with sync `failed` + the event id, and calling the same operation again retries the delete.
// In-memory Google + database (no network, no real credentials); the availability trigger runs on a real Postgres (PGlite).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { handleCancelBookingRequest } from '../supabase/functions/_shared/booking-cancel.mjs';
import { eventIdForBooking, resetTokenCache, syncBookingToCalendar } from '../supabase/functions/_shared/google-calendar.mjs';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const BOOKING_ID = '11111111-2222-4333-8444-555555555555';
const ENVIRONMENT = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', GOOGLE_CALENDAR_ID: 'cal@group.calendar.google.com', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@project.iam.gserviceaccount.com', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey };

// ---- fakes ---------------------------------------------------------------------------------------------------------------------------

function fakeGoogle() {
  const events = new Map();
  const calls = [];
  const state = { tokenFails: false, deleteStatus: null, tombstonePatch: 'revive' };
  const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target === 'https://oauth2.googleapis.com/token') return state.tokenFails ? respond(400, { error: 'invalid_grant' }) : respond(200, { access_token: 'fake-access-token', expires_in: 3600 });
    const method = init.method ?? 'GET';
    const match = target.match(/\/events(?:\/([^?]+))?$/);
    const id = match?.[1] ? decodeURIComponent(match[1]) : null;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, id });
    if (method === 'POST') {
      if (events.has(body.id)) return respond(409, { error: { message: 'The requested identifier already exists.' } });
      events.set(body.id, { ...body });
      return respond(200, events.get(body.id));
    }
    if (method === 'PATCH') {
      if (!events.has(id)) return respond(404, { error: { message: 'Not Found' } });
      if (events.get(id).tombstone) {
        if (state.tombstonePatch === '404') return respond(404, { error: { message: 'Not Found' } });
        events.set(id, { ...body });
        return respond(200, events.get(id));
      }
      events.set(id, { ...events.get(id), ...body });
      return respond(200, events.get(id));
    }
    if (method === 'DELETE') {
      if (state.deleteStatus) { const status = state.deleteStatus; state.deleteStatus = null; return status === 204 ? new Response(null, { status: 204 }) : respond(status, { error: { message: `Injected ${status}` } }); }
      if (!events.has(id)) return respond(404, { error: { message: 'Not Found' } });
      if (events.get(id).tombstone) return respond(410, { error: { message: 'Resource has been deleted' } });
      events.set(id, { ...events.get(id), status: 'cancelled', tombstone: true });
      return new Response(null, { status: 204 });
    }
    return respond(405, {});
  };
  return { events, calls, state, fetchImpl, deletes: () => calls.filter((call) => call.method === 'DELETE'), live: () => [...events.values()].filter((event) => !event.tombstone) };
}

const baseBooking = (changes = {}) => ({
  id: BOOKING_ID, booking_reference: 'PFT-000123', booking_status: 'confirmed', payment_status: 'paid', tour_date: '2026-12-01', guests: 4,
  departure_location_name_snapshot: 'Playas del Coco', google_calendar_event_id: null, google_calendar_sync_status: null,
  customers: { full_name: 'Brandon Aguirre', email: 'brandon@example.com', whatsapp: '+506 8888 0000' }, boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' },
  tour_packages: { name: 'Half Day', duration_minutes: 240 }, time_slots: { starts_at: '07:00:00' }, ...changes,
});

// `rpc` stands for update_booking_status: it applies the transition to the booking row (like the real function) unless `rpcError` is set.
function fakeBackend({ booking = baseBooking(), profile = { role: 'admin', active: true }, user = { id: 'user-1' }, rpcError = null, onRpc = null } = {}) {
  const store = { booking, profile, user, rpcCalls: [], updates: [] };
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
  const rpc = async (name, args) => {
    store.rpcCalls.push({ name, args });
    if (rpcError) return { data: null, error: rpcError };
    store.booking = { ...store.booking, booking_status: args.p_booking_status, payment_status: args.p_payment_status ?? store.booking.payment_status };
    if (onRpc) await onRpc(args);
    return { data: { booking_id: args.p_booking_id, booking_status: args.p_booking_status }, error: null };
  };
  const auth = { getUser: async () => (store.user ? { data: { user: store.user }, error: null } : { data: { user: null }, error: { message: 'bad token' } }) };
  const createClient = (_url, key) => (key === 'service' ? { from } : { auth, rpc });
  return { store, createClient };
}

const request = (body = { bookingId: BOOKING_ID }, token = 'valid') => new Request('https://f/admin-cancel-booking', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const cancel = (backend, google, req = request()) => handleCancelBookingRequest(req, { createClient: backend.createClient, env: (name) => ENVIRONMENT[name], fetchImpl: google.fetchImpl }, {});
const confirmedWithEvent = async (google, backend) => { // the state after a normal confirmation
  const result = await syncBookingToCalendar({ db: backend.createClient('u', 'service'), env: { calendarId: ENVIRONMENT.GOOGLE_CALENDAR_ID, email: ENVIRONMENT.GOOGLE_SERVICE_ACCOUNT_EMAIL, privateKey }, fetchImpl: google.fetchImpl, bookingId: BOOKING_ID });
  assert.equal(result.status, 'synced');
};
const sync = (google, backend) => syncBookingToCalendar({ db: backend.createClient('u', 'service'), env: { calendarId: ENVIRONMENT.GOOGLE_CALENDAR_ID, email: ENVIRONMENT.GOOGLE_SERVICE_ACCOUNT_EMAIL, privateKey }, fetchImpl: google.fetchImpl, bookingId: BOOKING_ID });

test.beforeEach(() => resetTokenCache());

// ---- one request does everything -----------------------------------------------------------------------------------------------------

test('ONE request cancels the booking and deletes its Calendar event; nothing else is needed from the browser', async () => {
  const google = fakeGoogle(); const backend = fakeBackend();
  await confirmedWithEvent(google, backend);
  const eventId = backend.store.booking.google_calendar_event_id;
  assert.equal(google.live().length, 1);

  const response = await cancel(backend, google); // the ONLY call the client makes
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual([body.booking_status, body.transitioned, body.calendar.status, body.calendar.operation], ['cancelled', true, 'synced', 'delete']);
  assert.deepEqual(backend.store.rpcCalls.map((call) => [call.name, call.args.p_booking_status]), [['update_booking_status', 'cancelled']]);
  assert.deepEqual(google.deletes().map((call) => call.id), [eventId], 'the event is deleted exactly once, by the same request');
  assert.equal(google.live().length, 0);
  assert.equal(backend.store.booking.booking_status, 'cancelled');
  assert.equal(backend.store.booking.google_calendar_event_id, null);
  assert.equal(backend.store.booking.google_calendar_sync_status, 'synced');
  assert.equal(backend.store.booking.google_calendar_sync_error, null);
  assert.ok(backend.store.booking.google_calendar_synced_at);
  // The response waited for the attempt: the DELETE had already happened when the handler resolved (no background work left).
  const callsWhenAnswered = google.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(google.calls.length, callsWhenAnswered, 'nothing keeps running after the response');
});

test('payment status: a booking that was never paid is closed as failed, a paid one keeps paid', async () => {
  for (const [before, after] of [['pending', 'failed'], ['paid', 'paid']]) {
    const backend = fakeBackend({ booking: baseBooking({ payment_status: before }) });
    await cancel(backend, fakeGoogle());
    assert.equal(backend.store.rpcCalls[0].args.p_payment_status, after, before);
  }
});

// ---- Google failures never revert the cancellation -----------------------------------------------------------------------------------

test('a Google failure leaves the booking cancelled with sync failed and the event id kept; the same operation retries and deletes it', async () => {
  const google = fakeGoogle(); const backend = fakeBackend();
  await confirmedWithEvent(google, backend);
  const eventId = backend.store.booking.google_calendar_event_id;
  google.state.deleteStatus = 500;
  const first = await cancel(backend, google);
  const failed = await first.json();
  assert.equal(first.status, 200, 'the cancellation succeeded, so the request does too');
  assert.deepEqual([failed.booking_status, failed.calendar.status], ['cancelled', 'failed']);
  assert.match(failed.calendar.error, /Google Calendar respondió 500/);
  assert.equal(backend.store.booking.booking_status, 'cancelled');
  assert.equal(backend.store.booking.google_calendar_sync_status, 'failed');
  assert.equal(backend.store.booking.google_calendar_event_id, eventId, 'the id is kept so the delete can be retried');
  assert.equal(google.live().length, 1, 'the event is still there');

  const retry = await (await cancel(backend, google)).json(); // Reintentar = the same operation
  assert.deepEqual([retry.transitioned, retry.calendar.status, retry.calendar.operation], [false, 'synced', 'delete']);
  assert.equal(backend.store.rpcCalls.length, 1, 'the cancellation is not repeated');
  assert.equal(google.live().length, 0);
  assert.equal(backend.store.booking.google_calendar_event_id, null);
  assert.equal(backend.store.booking.google_calendar_sync_status, 'synced');
  assert.equal(backend.store.booking.google_calendar_sync_error, null);
});

test('rejected Google credentials are failed too (still cancelled, still retryable), never an error response', async () => {
  const google = fakeGoogle(); const backend = fakeBackend({ booking: baseBooking({ google_calendar_event_id: 'evt', google_calendar_sync_status: 'synced' }) });
  google.state.tokenFails = true;
  const response = await cancel(backend, google);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.calendar.status, 'failed');
  assert.match(body.calendar.error, /rechazó la autenticación/);
  assert.equal(backend.store.booking.booking_status, 'cancelled');
  assert.equal(backend.store.booking.google_calendar_event_id, 'evt');
  assert.doesNotMatch(JSON.stringify(body), /BEGIN PRIVATE KEY|fake-access-token|eyJ/);
});

test('204, 404 and 410 from Google all count as success: event id cleared, synced, no error', async () => {
  for (const status of [204, 404, 410]) {
    const google = fakeGoogle(); const backend = fakeBackend();
    await confirmedWithEvent(google, backend);
    google.state.deleteStatus = status;
    const body = await (await cancel(backend, google)).json();
    assert.deepEqual([body.calendar.status, body.calendar.operation], ['synced', 'delete'], String(status));
    assert.equal(backend.store.booking.google_calendar_event_id, null, String(status));
    assert.equal(backend.store.booking.google_calendar_sync_status, 'synced', String(status));
    assert.equal(backend.store.booking.google_calendar_sync_error, null, String(status));
  }
});

// ---- idempotency ---------------------------------------------------------------------------------------------------------------------

test('cancelling an already cancelled booking is an idempotent retry: no second transition, and nothing to do once Calendar is clean', async () => {
  const google = fakeGoogle(); const backend = fakeBackend();
  await confirmedWithEvent(google, backend);
  await cancel(backend, google);
  const callsBefore = google.calls.length;
  const again = await (await cancel(backend, google)).json();
  assert.deepEqual([again.booking_status, again.transitioned, again.calendar.status], ['cancelled', false, 'skipped']);
  assert.equal(backend.store.rpcCalls.length, 1, 'update_booking_status ran only once');
  assert.equal(google.calls.length, callsBefore, 'Google is not touched again');
});

test('a booking that never had a Calendar event is cancelled without any Google call', async () => {
  const google = fakeGoogle(); const backend = fakeBackend({ booking: baseBooking({ booking_status: 'pending_payment', payment_status: 'pending' }) });
  const body = await (await cancel(backend, google)).json();
  assert.deepEqual([body.booking_status, body.calendar.status], ['cancelled', 'skipped']);
  assert.equal(google.calls.length, 0);
});

// ---- the cancellation itself ---------------------------------------------------------------------------------------------------------

test('if the database refuses the cancellation (no permission, invalid state) the Calendar event is NOT touched', async () => {
  const google = fakeGoogle(); const backend = fakeBackend({ rpcError: { message: 'admin or editor role required', code: '42501' } });
  await confirmedWithEvent(google, backend);
  const before = google.calls.length;
  const response = await cancel(backend, google);
  assert.equal(response.status, 403);
  assert.equal(google.calls.length, before);
  assert.equal(google.live().length, 1);
  assert.equal(backend.store.booking.booking_status, 'confirmed');
});

test('authorization: no token 401, invalid session 401, viewer / inactive 403, bad payload 400, unknown booking 404 — none of them touches Calendar', async () => {
  const google = fakeGoogle();
  assert.equal((await cancel(fakeBackend(), google, request({ bookingId: BOOKING_ID }, null))).status, 401);
  assert.equal((await cancel(fakeBackend({ user: null }), google)).status, 401);
  assert.equal((await cancel(fakeBackend({ profile: { role: 'viewer', active: true } }), google)).status, 403);
  assert.equal((await cancel(fakeBackend({ profile: { role: 'admin', active: false } }), google)).status, 403);
  assert.equal((await cancel(fakeBackend(), google, request({ bookingId: 'not-a-uuid' }))).status, 400);
  assert.equal((await cancel(fakeBackend({ booking: null }), google)).status, 404);
  assert.equal((await handleCancelBookingRequest(new Request('https://f/x', { method: 'GET' }), { createClient: fakeBackend().createClient, env: (name) => ENVIRONMENT[name] }, {})).status, 405);
  assert.equal(google.calls.length, 0);
});

test('even if the Calendar step blows up unexpectedly, the booking stays cancelled and the answer reports failed', async () => {
  const google = fakeGoogle(); const backend = fakeBackend();
  const createClient = (url, key) => { const client = backend.createClient(url, key); return key === 'service' ? { from: (table) => { if (table === 'bookings' && backend.store.booking.booking_status === 'cancelled') throw new Error('db down'); return client.from(table); } } : client; };
  const response = await handleCancelBookingRequest(request(), { createClient, env: (name) => ENVIRONMENT[name], fetchImpl: google.fetchImpl }, {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual([body.booking_status, body.calendar.status], ['cancelled', 'failed']);
  assert.equal(backend.store.booking.booking_status, 'cancelled');
});

// ---- re-confirming ------------------------------------------------------------------------------------------------------------------

for (const tombstonePatch of ['revive', '404']) {
  test(`re-confirming after a cancellation creates exactly ONE event again (Google ${tombstonePatch === 'revive' ? 'revives the deleted id' : 'refuses the deleted id'})`, async () => {
    const google = fakeGoogle(); const backend = fakeBackend();
    google.state.tombstonePatch = tombstonePatch;
    await confirmedWithEvent(google, backend);
    await cancel(backend, google);
    assert.equal(google.live().length, 0);
    backend.store.booking = { ...backend.store.booking, booking_status: 'confirmed', google_calendar_sync_status: 'pending' }; // confirmed again; the trigger sets pending
    assert.equal((await sync(google, backend)).status, 'synced');
    assert.equal(google.live().length, 1);
    await Promise.all([sync(google, backend), sync(google, backend)]);
    assert.equal(google.live().length, 1, 'retries and double clicks never duplicate it');
    // Cancelling it again deletes that one event.
    await cancel(backend, google);
    assert.equal(google.live().length, 0);
  });
}

// ---- availability is released by the existing trigger -----------------------------------------------------------------------------

test('cancelling through this request releases the slot (existing availability trigger on a real Postgres), so someone else can book it', async () => {
  const migration = fs.readFileSync('supabase/migrations/202608260001_confirmed_booking_availability_blocks.sql', 'utf8');
  const start = migration.indexOf('create or replace function public.sync_booking_availability_block(');
  const trigger = migration.slice(start, migration.indexOf('execute function public.sync_booking_availability_block();', start) + 'execute function public.sync_booking_availability_block();'.length);
  const pg = new PGlite();
  await pg.exec(`
    create table public.bookings (id uuid primary key, booking_reference text, boat_id text not null, tour_date date not null, time_slot_id text not null, booking_status text not null);
    create table public.availability_blocks (id uuid primary key default gen_random_uuid(), boat_id text not null, tour_date date not null, time_slot_id text not null, reason text, source text not null, booking_id uuid references public.bookings(id) on delete cascade, active boolean not null default true);
    create unique index one_active_slot on public.availability_blocks (boat_id, tour_date, time_slot_id) where active = true;
    ${trigger}
    insert into public.bookings values ('${BOOKING_ID}', 'PFT-000123', 'boat-1', '2026-12-01', 'morning', 'confirmed');
  `);
  const active = async () => (await pg.query('select count(*)::int as n from public.availability_blocks where active')).rows[0].n;
  assert.equal(await active(), 1, 'the confirmed booking holds its slot');

  const google = fakeGoogle();
  const backend = fakeBackend({ onRpc: (args) => pg.query('update public.bookings set booking_status = $2 where id = $1', [args.p_booking_id, args.p_booking_status]) });
  await confirmedWithEvent(google, backend);
  const body = await (await cancel(backend, google)).json();
  assert.equal(body.calendar.status, 'synced');
  assert.equal(await active(), 0, 'the slot is free as soon as the request returns');
  await pg.query(`insert into public.bookings values (gen_random_uuid(), 'PFT-000999', 'boat-1', '2026-12-01', 'morning', 'confirmed')`);
  assert.equal(await active(), 1, 'a new booking takes the released slot');
  await pg.close();
});

test('the event id of a booking is derived, so a lost id can still be deleted (cancel works when only the derived id exists in Google)', async () => {
  const google = fakeGoogle(); const backend = fakeBackend();
  await confirmedWithEvent(google, backend);
  backend.store.booking = { ...backend.store.booking, google_calendar_event_id: null, google_calendar_sync_status: 'failed' }; // the id was never saved
  const body = await (await cancel(backend, google)).json();
  assert.equal(body.calendar.status, 'synced');
  assert.deepEqual(google.deletes().map((call) => call.id), [eventIdForBooking(BOOKING_ID)]);
  assert.equal(google.live().length, 0);
});
