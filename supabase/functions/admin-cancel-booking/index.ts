import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';
import { handleCancelBookingRequest } from '../_shared/booking-cancel.mjs';

// Cancels ONE booking from the Admin and removes its Google Calendar event, all in this single request (the browser never has to make a
// second call). Body: { bookingId }. Admin / editor only. Mirror of admin-confirm-booking.
// Secrets (Supabase): GOOGLE_CALENDAR_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.
serve(withCors(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  return handleCancelBookingRequest(req, {
    createClient,
    env: (name: string) => Deno.env.get(name),
    fetchImpl: fetch,
    // Internal diagnosis only: ids and error text. Never keys, JWTs or tokens.
    log: (level: 'info' | 'error', message: string, details: Record<string, unknown>) => (level === 'error' ? console.error : console.log)(`[admin-cancel-booking] ${message}`, details),
  }, headers);
}));
