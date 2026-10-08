// Google Calendar sync for confirmed bookings (server side only). Plain JS so the Edge Function and the Node tests share it.
//
//  - Service Account -> signed JWT (Web Crypto) -> Google token endpoint -> Calendar API (fetch). No OAuth screen, no refresh tokens.
//  - One booking = at most ONE event. The event id is derived from the booking id, so even a retry after a timeout (Google created the
//    event but we never saved its id) or two parallel calls converge on the same event instead of creating a second one.
//  - The booking is the source of truth: a Google failure never fails the booking, it is recorded (`failed`) and can be retried.
//  - A cancelled booking has NO event: cancelling deletes it for real (no "[CANCELADA]" copy is kept); re-confirming creates it again.
//  - Never logs or returns the private key, the signed JWT or the access token.

export const CALENDAR_TIMEZONE = 'America/Costa_Rica';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars';

const PAYMENT_LABELS = { pending: 'Pendiente', processing: 'Procesando', paid: 'Pagado', failed: 'Fallido', refunded: 'Reembolsado' };

/** Google accepts caller-chosen event ids made of a-v and 0-9 (base32hex): a UUID without dashes qualifies. */
export const eventIdForBooking = (bookingId) => String(bookingId).replace(/-/g, '').toLowerCase();

const pad = (value) => String(value).padStart(2, '0');

/** "2026-12-01" + "07:00:00" (+ minutes) -> local wall-clock parts. Costa Rica has no DST, so plain arithmetic is exact. */
export function localDateTime(date, time, addMinutes = 0) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = String(time).split(':').map((part) => Number(part ?? 0));
  const moment = new Date(Date.UTC(year, month - 1, day, hour, minute || 0, second || 0) + addMinutes * 60000);
  return `${moment.getUTCFullYear()}-${pad(moment.getUTCMonth() + 1)}-${pad(moment.getUTCDate())}T${pad(moment.getUTCHours())}:${pad(moment.getUTCMinutes())}:${pad(moment.getUTCSeconds())}`;
}

export class CalendarSyncError extends Error {
  constructor(message, code = 'calendar_error') {
    super(message);
    this.name = 'CalendarSyncError';
    this.code = code;
  }
}

/** Everything the event needs comes from the DATABASE row (never from the caller). Throws CalendarSyncError when it cannot be built honestly. */
export function buildEvent(booking) {
  const tourTitle = booking.tours?.title ?? '';
  const customerName = booking.customers?.full_name ?? '';
  const startTime = booking.time_slots?.starts_at;
  const duration = booking.tour_packages?.duration_minutes;
  if (!booking.tour_date || !startTime) throw new CalendarSyncError('Falta la fecha o la hora de salida de la reserva.', 'missing_schedule');
  if (!Number.isInteger(duration) || duration <= 0) throw new CalendarSyncError('El paquete no tiene una duración válida.', 'missing_duration');
  const title = `${tourTitle} — ${customerName}`;
  const description = [
    `Reserva: ${booking.booking_reference ?? booking.id}`,
    `Cliente: ${customerName}`,
    `Email: ${booking.customers?.email || '-'}`,
    `WhatsApp: ${booking.customers?.whatsapp || '-'}`,
    `Bote: ${booking.boats?.name ?? '-'}`,
    `Tour: ${tourTitle}`,
    `Paquete: ${booking.tour_packages?.name ?? '-'}`,
    `Personas: ${booking.guests}`,
    `Pago: ${PAYMENT_LABELS[booking.payment_status] ?? booking.payment_status}`,
  ].join('\n');
  return {
    summary: title,
    description,
    location: booking.departure_location_name_snapshot || undefined,
    start: { dateTime: localDateTime(booking.tour_date, startTime), timeZone: CALENDAR_TIMEZONE },
    end: { dateTime: localDateTime(booking.tour_date, startTime, duration), timeZone: CALENDAR_TIMEZONE },
    // A previously deleted Google event comes back to life on update (re-confirming a cancelled booking).
    status: 'confirmed',
    // V1: no guests are invited, no emails from Calendar, no Meet links (attendees / conferenceData are simply absent).
  };
}

// --- Service Account authentication ------------------------------------------------------------------------------------------------

const base64Url = (input) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function importPrivateKey(pem) {
  const body = String(pem).replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

let cachedToken = null;

/** Access token for the Service Account (cached in the isolate until shortly before it expires). */
export async function getAccessToken(env, fetchImpl = fetch) {
  if (cachedToken && cachedToken.email === env.email && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value;
  if (!env.email || !env.privateKey) throw new CalendarSyncError('Google Calendar no está configurado.', 'not_configured');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(JSON.stringify({ iss: env.email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
  const key = await importPrivateKey(env.privateKey);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64Url(signature)}` }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new CalendarSyncError(`Google rechazó la autenticación (${data.error ?? response.status}).`, 'auth_failed');
  cachedToken = { email: env.email, value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

export const resetTokenCache = () => { cachedToken = null; };

// --- Calendar events ----------------------------------------------------------------------------------------------------------------

async function callCalendar(env, token, method, path, body, fetchImpl) {
  const response = await fetchImpl(`${CALENDAR_API}/${encodeURIComponent(env.calendarId)}/events${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

const googleError = (result) => new CalendarSyncError(`Google Calendar respondió ${result.status}${result.data?.error?.message ? `: ${String(result.data.error.message).slice(0, 200)}` : ''}.`, 'google_error');

/**
 * Create the event or update THE SAME one. Returns { eventId, operation }.
 *  - known event id            -> PATCH it (if Google says it is gone, create a fresh one)
 *  - no event id               -> insert with the id derived from the booking; "already exists" (409) means a previous attempt or a parallel
 *                                 call already created it, so it is updated instead — never a second event.
 */
export async function upsertEvent(env, token, { knownEventId, bookingId, event }, fetchImpl = fetch) {
  if (knownEventId) {
    const updated = await callCalendar(env, token, 'PATCH', `/${encodeURIComponent(knownEventId)}`, event, fetchImpl);
    if (updated.ok) return { eventId: knownEventId, operation: 'update' };
    if (updated.status !== 404 && updated.status !== 410) throw googleError(updated);
    // The event was removed by hand in Google: recreate it under a new id (a deleted id cannot be reused).
    const fresh = `${eventIdForBooking(bookingId)}${Date.now().toString(32)}`.slice(0, 120);
    const recreated = await callCalendar(env, token, 'POST', '', { ...event, id: fresh }, fetchImpl);
    if (!recreated.ok) throw googleError(recreated);
    return { eventId: recreated.data.id ?? fresh, operation: 'create' };
  }
  const id = eventIdForBooking(bookingId);
  const created = await callCalendar(env, token, 'POST', '', { ...event, id }, fetchImpl);
  if (created.ok) return { eventId: created.data.id ?? id, operation: 'create' };
  if (created.status === 409) {
    const existing = await callCalendar(env, token, 'PATCH', `/${encodeURIComponent(id)}`, event, fetchImpl);
    if (existing.ok) return { eventId: id, operation: 'update' };
    if (existing.status !== 404 && existing.status !== 410) throw googleError(existing);
    // The id belongs to an event that was deleted (e.g. the booking was cancelled and is now confirmed again) and Google will not bring
    // it back: a deleted id cannot be reused, so the event is created under a fresh one (still ONE live event for the booking).
    const fresh = `${id}${Date.now().toString(32)}`.slice(0, 120);
    const recreated = await callCalendar(env, token, 'POST', '', { ...event, id: fresh }, fetchImpl);
    if (!recreated.ok) throw googleError(recreated);
    return { eventId: recreated.data.id ?? fresh, operation: 'create' };
  }
  throw googleError(created);
}

/**
 * Delete the event for real. Idempotent: 204 / 200 = deleted, 404 / 410 = it was already gone (both are success); anything else throws
 * (the caller records it as a failed sync and keeps the event id so the delete can be retried). Returns { deleted, alreadyGone }.
 */
export async function deleteEvent(env, token, eventId, fetchImpl = fetch) {
  const result = await callCalendar(env, token, 'DELETE', `/${encodeURIComponent(eventId)}`, undefined, fetchImpl);
  if (result.status === 204 || result.status === 200) return { deleted: true, alreadyGone: false };
  if (result.status === 404 || result.status === 410) return { deleted: false, alreadyGone: true };
  throw googleError(result);
}

/**
 * Remove the event of a booking that is going away (cancelled, or about to be deleted for good). Never throws: { status: 'deleted' |
 * 'already_gone' | 'skipped' | 'failed', error? }. `eventId` is the stored google_calendar_event_id; without one there is nothing to delete.
 * Any flow that physically deletes a booking must call this BEFORE deleting the row (the event id is gone afterwards) and must not delete
 * the row when the status is 'failed'.
 */
export async function deleteBookingEvent({ env, fetchImpl = fetch, eventId, bookingId, log = () => {} }) {
  if (!eventId) return { status: 'skipped' };
  try {
    const token = await getAccessToken(env, fetchImpl);
    const { alreadyGone } = await deleteEvent(env, token, eventId, fetchImpl);
    log('info', 'calendar event deleted', { bookingId, eventId, alreadyGone });
    return { status: alreadyGone ? 'already_gone' : 'deleted' };
  } catch (error) {
    log('error', 'calendar event could not be deleted', { bookingId, eventId, code: error?.code, message: shortError(error) });
    return { status: 'failed', error: shortError(error) };
  }
}

// --- Booking sync -------------------------------------------------------------------------------------------------------------------

export const BOOKING_SELECT = 'id, booking_reference, booking_status, payment_status, tour_date, guests, departure_location_name_snapshot, google_calendar_event_id, google_calendar_sync_status, customers(full_name, email, whatsapp), boats(name), tours(title), tour_packages(name, duration_minutes), time_slots(starts_at)';

/** Statuses that keep (or create) the event. A `cancelled` booking has no event: it is deleted. */
const LIVE_STATUSES = ['confirmed', 'completed'];

const shortError = (error) => String(error instanceof Error ? error.message : error).slice(0, 300);

/**
 * Sync ONE booking with Google Calendar. `db` is a Supabase service-role client. Always resolves with a result object (never throws for
 * Google problems): { status: 'synced' | 'failed' | 'skipped', operation?, eventId?, error? }.
 *
 * Calendar state after a sync (google_calendar_sync_status / _event_id):
 *   confirmed | completed  -> synced + the event id (or failed + the previous id, retryable)
 *   cancelled              -> synced + NO event id (the event was deleted or never existed) — for a cancelled booking this means
 *                             "nothing in the calendar"; failed + the event id when the delete did not go through (retryable).
 */
export async function syncBookingToCalendar({ db, env, fetchImpl = fetch, bookingId, log = () => {} }) {
  const { data: booking, error: loadError } = await db.from('bookings').select(BOOKING_SELECT).eq('id', bookingId).maybeSingle();
  if (loadError) throw new Error('Booking could not be loaded');
  if (!booking) return { status: 'not_found' };

  const cancelled = booking.booking_status === 'cancelled';
  const live = LIVE_STATUSES.includes(booking.booking_status);
  // Pending / draft bookings never get an event. A cancelled booking only needs work while an event may still exist: it has an id, or a
  // previous sync did not settle (a create may have reached Google without its id being saved — the id is derived from the booking).
  const unsettled = ['pending', 'failed'].includes(booking.google_calendar_sync_status);
  if (!live && !(cancelled && (booking.google_calendar_event_id || unsettled))) return { status: 'skipped', reason: cancelled ? 'no_event' : 'not_confirmed' };

  const record = async (fields) => {
    const { error } = await db.from('bookings').update(fields).eq('id', bookingId);
    if (error) log('error', 'sync state could not be saved', { bookingId, message: error.message });
  };

  await record({ google_calendar_sync_status: 'pending' });
  if (cancelled) {
    // The cancellation is already saved (and the slot released); only now is the event removed. Failing here never un-cancels the booking.
    const result = await deleteBookingEvent({ env, fetchImpl, eventId: booking.google_calendar_event_id ?? eventIdForBooking(bookingId), bookingId, log });
    if (result.status === 'failed') {
      await record({ google_calendar_sync_status: 'failed', google_calendar_sync_error: result.error });
      return { status: 'failed', error: result.error };
    }
    await record({ google_calendar_event_id: null, google_calendar_sync_status: 'synced', google_calendar_synced_at: new Date().toISOString(), google_calendar_sync_error: null });
    return { status: 'synced', operation: 'delete' };
  }
  try {
    const event = buildEvent(booking);
    const token = await getAccessToken(env, fetchImpl);
    const { eventId, operation } = await upsertEvent(env, token, { knownEventId: booking.google_calendar_event_id, bookingId, event }, fetchImpl);
    await record({ google_calendar_event_id: eventId, google_calendar_sync_status: 'synced', google_calendar_synced_at: new Date().toISOString(), google_calendar_sync_error: null });
    log('info', 'calendar synced', { bookingId, eventId, operation });
    return { status: 'synced', operation, eventId };
  } catch (error) {
    const message = shortError(error);
    await record({ google_calendar_sync_status: 'failed', google_calendar_sync_error: message });
    log('error', 'calendar sync failed', { bookingId, eventId: booking.google_calendar_event_id, code: error?.code, message });
    return { status: 'failed', error: message };
  }
}

// --- HTTP handler (deps injected so it is testable without Deno) ------------------------------------------------------------

/**
 * POST { reservationId } from the Admin. Requires an authenticated admin / editor. The body carries ONLY the id: everything else is read
 * from the database. `deps`: { createClient, env: (name) => string | undefined, fetchImpl, log }.
 */
export async function handleSyncRequest(req, deps, headers) {
  const json = (body, status = 200) => Response.json(body, { status, headers });
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => null);
  const reservationId = body?.reservationId;
  if (typeof reservationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(reservationId)) return json({ message: 'Invalid reservation payload' }, 400);

  const url = deps.env('SUPABASE_URL');
  const serviceRole = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) return json({ message: 'Supabase secrets are not configured' }, 500);
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ message: 'Admin session required' }, 401);

  const db = deps.createClient(url, serviceRole, { auth: { persistSession: false } });
  const userClient = deps.createClient(url, deps.env('SUPABASE_ANON_KEY') ?? serviceRole, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  try {
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user) return json({ message: 'Invalid admin session' }, 401);
    const { data: profile, error: profileError } = await db.from('profiles').select('role, active').eq('id', userData.user.id).maybeSingle();
    if (profileError) return json({ message: 'Admin profile could not be verified' }, 500);
    if (!profile?.active || !['admin', 'editor'].includes(profile.role)) return json({ message: 'Admin or editor role required' }, 403);

    const result = await syncBookingToCalendar({
      db,
      env: { calendarId: deps.env('GOOGLE_CALENDAR_ID'), email: deps.env('GOOGLE_SERVICE_ACCOUNT_EMAIL'), privateKey: deps.env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') },
      fetchImpl: deps.fetchImpl ?? fetch,
      bookingId: reservationId,
      log: deps.log ?? (() => {}),
    });
    if (result.status === 'not_found') return json({ message: 'Reservation not found' }, 404);
    return json(result);
  } catch (error) {
    deps.log?.('error', 'sync request failed', { reservationId, message: shortError(error) });
    return json({ message: 'Calendar sync could not be completed' }, 500);
  }
}

// --- Automatic confirmations (PayPal capture / webhook, any server-side flow) -----------------------------------------------------

/**
 * Called right AFTER a booking was confirmed by a payment flow. The booking and the payment are already saved and final, so this can
 * never fail them: it never throws, it does not return anything the customer could see, and a Google problem only leaves the calendar
 * state `failed` (the Admin shows "No sincronizada" + Reintentar). Repeated calls (capture + webhook + retries) converge on ONE event:
 * an already synced booking is left alone, and two calls racing each other share the deterministic event id (see upsertEvent).
 */
export async function syncConfirmedBookingSafely({ db, env, fetchImpl = fetch, bookingId, log = () => {} }) {
  try {
    const { data: current } = await db.from('bookings').select('booking_status, google_calendar_event_id, google_calendar_sync_status').eq('id', bookingId).maybeSingle();
    if (current?.booking_status === 'confirmed' && current.google_calendar_sync_status === 'synced' && current.google_calendar_event_id) {
      return { status: 'skipped', reason: 'already_synced' };
    }
    return await syncBookingToCalendar({ db, env, fetchImpl, bookingId, log });
  } catch (error) {
    log('error', 'automatic calendar sync failed', { bookingId, message: shortError(error) });
    return { status: 'failed', error: shortError(error) };
  }
}
