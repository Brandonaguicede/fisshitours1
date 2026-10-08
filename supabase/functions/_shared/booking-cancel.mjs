// Cancel a booking from the Admin, entirely on the server (plain JS so the Edge Function and the Node tests share it).
//
// One request does everything, so closing the tab can never separate "cancelled" from "its Calendar event removed":
//   1. the caller must be an authenticated admin / editor;
//   2. the booking is cancelled through the existing `update_booking_status` RPC (the trigger releases the availability block in the same
//      transaction) — skipped when it is already cancelled, so the same call is an idempotent Calendar retry;
//   3. the Calendar event is deleted once, deterministically, and the response waits for that attempt;
//   4. a Google problem NEVER reverts the cancellation: the booking stays cancelled, the sync state is `failed` with the event id kept
//      (retry = call this again) and the response says so.
import { syncBookingToCalendar } from './google-calendar.mjs';

const shortError = (error) => String(error instanceof Error ? error.message : error).slice(0, 300);

/**
 * POST { bookingId }. `deps`: { createClient, env: (name) => string | undefined, fetchImpl, log }.
 * 200 { booking_id, booking_status: 'cancelled', payment_status, transitioned, calendar: { status, operation?, error? } }.
 */
export async function handleCancelBookingRequest(req, deps, headers) {
  const json = (body, status = 200) => Response.json(body, { status, headers });
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => null);
  const bookingId = body?.bookingId;
  if (typeof bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bookingId)) return json({ message: 'Invalid booking payload' }, 400);

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

    const { data: booking, error: bookingError } = await db.from('bookings').select('id, booking_status, payment_status').eq('id', bookingId).maybeSingle();
    if (bookingError) return json({ message: 'Booking could not be loaded' }, 500);
    if (!booking) return json({ message: 'Booking not found' }, 404);

    let paymentStatus = booking.payment_status;
    const transitioned = booking.booking_status !== 'cancelled';
    if (transitioned) {
      // A booking that was never paid is closed as a failed payment; a paid one keeps its payment status (a refund is a separate decision).
      paymentStatus = booking.payment_status === 'paid' ? booking.payment_status : 'failed';
      const { error } = await userClient.rpc('update_booking_status', {
        p_booking_id: bookingId,
        p_booking_status: 'cancelled',
        p_payment_status: paymentStatus,
        p_note: 'Reserva cancelada desde admin. Bloqueo liberado.',
      });
      if (error) return json({ message: error.message }, error.code === '42501' ? 403 : 400);
    }

    // The cancellation is saved. From here on nothing can fail the request: the Calendar result is just reported.
    let calendar;
    try {
      calendar = await syncBookingToCalendar({
        db,
        env: { calendarId: deps.env('GOOGLE_CALENDAR_ID'), email: deps.env('GOOGLE_SERVICE_ACCOUNT_EMAIL'), privateKey: deps.env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') },
        fetchImpl: deps.fetchImpl ?? fetch,
        bookingId,
        log: deps.log ?? (() => {}),
      });
    } catch (error) {
      deps.log?.('error', 'calendar delete after cancelling could not run', { bookingId, message: shortError(error) });
      calendar = { status: 'failed', error: 'Calendar sync could not be completed' };
    }
    return json({ booking_id: bookingId, booking_status: 'cancelled', payment_status: paymentStatus, transitioned, calendar });
  } catch (error) {
    deps.log?.('error', 'cancel request failed', { bookingId, message: shortError(error) });
    return json({ message: 'Booking could not be cancelled' }, 500);
  }
}
