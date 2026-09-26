import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';
import { handleSyncRequest } from '../_shared/google-calendar.mjs';

// Syncs ONE confirmed / cancelled booking with the shared Google Calendar. Body: { reservationId } — nothing else is trusted from the
// client; the booking, customer, boat, tour, package, departure and payment data are read from the database. Admin / editor only.
// Secrets (Supabase): GOOGLE_CALENDAR_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.
serve(withCors(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  return handleSyncRequest(req, {
    createClient,
    env: (name: string) => Deno.env.get(name),
    fetchImpl: fetch,
    // Internal diagnosis only: ids, operation and error text. Never keys, JWTs or tokens.
    log: (level: 'info' | 'error', message: string, details: Record<string, unknown>) => (level === 'error' ? console.error : console.log)(`[sync-reservation-calendar] ${message}`, details),
  }, headers);
}));
