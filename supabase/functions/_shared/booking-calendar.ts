import { syncConfirmedBookingSafely } from './google-calendar.mjs';

// Google Calendar for bookings confirmed by an automatic flow (PayPal capture / webhook). Reuses the SAME sync as the Admin
// (google-calendar.mjs): nothing about Google is implemented twice. Never throws, never blocks or fails the payment.
export function syncBookingCalendarAfterConfirmation(db: unknown, bookingId: string) {
  return syncConfirmedBookingSafely({
    db,
    bookingId,
    env: {
      calendarId: Deno.env.get('GOOGLE_CALENDAR_ID'),
      email: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      privateKey: Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'),
    },
    fetchImpl: fetch,
    // Internal diagnosis only: ids and error text, never keys, JWTs or tokens.
    log: (level: 'info' | 'error', message: string, details: Record<string, unknown>) => (level === 'error' ? console.error : console.log)(`[booking-calendar] ${message}`, details),
  });
}
