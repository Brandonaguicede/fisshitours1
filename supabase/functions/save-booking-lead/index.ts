import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';

// Keeps the contact data of an unfinished booking attempt ("lead"). It NEVER creates a booking, customer, payment, availability block
// or Calendar event: it only calls the upsert_booking_lead RPC. The lead is identified by clientToken alone (never by email/phone/name).
// Name, email and WhatsApp are personal data: nothing in this file logs them.
const schema = z.object({
  clientToken: z.string().uuid(),
  customer: z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    // International format (E.164, e.g. +50688881234): the checkout builds it from an explicit country prefix, the server never guesses one.
    whatsapp: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  }),
  language: z.enum(['es', 'en']).optional().default('es'),
  context: z.object({
    boatId: z.string().min(1).max(100).optional(),
    tourId: z.string().min(1).max(100).optional(),
    tourPackageId: z.string().min(1).max(100).optional(),
    tourDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    timeSlotId: z.string().min(1).max(100).optional(),
    guests: z.number().int().min(1).max(99).optional(),
  }).optional().default({}),
});

serve(withCors(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  // Incomplete or invalid contact data is rejected, so no half-filled lead is ever stored. The issues are not echoed (they would carry the values).
  if (!parsed.success) return Response.json({ message: 'Invalid booking lead' }, { status: 400, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const hashSecret = Deno.env.get('RATE_LIMIT_HASH_SECRET');
  if (!supabaseUrl || !serviceRole || !hashSecret) return Response.json({ message: 'Server is not configured' }, { status: 500, headers });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  // Separate bucket from the booking rate limit ("lead:" prefix before hashing): saving a lead never consumes the booking quota.
  const maxRequests = Number(Deno.env.get('LEAD_RATE_LIMIT_MAX_REQUESTS') ?? '30');
  const windowMinutes = Number(Deno.env.get('LEAD_RATE_LIMIT_WINDOW_MINUTES') ?? '15');
  const ipHash = await hashValue(`lead:${getClientIp(req)}`, hashSecret);
  const { data: allowed, error: rateError } = await supabase.rpc('check_booking_rate_limit', {
    p_ip_hash: ipHash,
    p_limit: Number.isFinite(maxRequests) ? maxRequests : 30,
    p_window_minutes: Number.isFinite(windowMinutes) ? windowMinutes : 15,
  });
  if (rateError) return Response.json({ message: 'Rate limit check failed' }, { status: 400, headers });
  if (!allowed) return Response.json({ message: 'Too many requests. Try again later.' }, { status: 429, headers });

  const { data, error } = await supabase.rpc('upsert_booking_lead', { p: parsed.data });
  if (error) {
    // The database raises LEAD_* codes without the values; log only the code.
    const code = /LEAD_[A-Z_]+/.exec(error.message ?? '')?.[0];
    if (code) return Response.json({ message: code, code }, { status: 400, headers });
    console.error('save-booking-lead failed', { code: error.code });
    return Response.json({ message: 'Booking lead could not be saved' }, { status: 500, headers });
  }

  return Response.json({ saved: Boolean(data?.saved) }, { status: 200, headers });
}));

function getClientIp(req: Request) {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

async function hashValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
