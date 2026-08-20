import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { areExternalProviderMocksAllowed } from '../_shared/environment.ts';

const schema = z.object({
  customer: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email(),
    whatsapp: z.string().min(7).max(32),
    country: z.string().max(80).optional(),
  }),
  boatId: z.string().min(1),
  tourId: z.string().min(1),
  tourPackageId: z.string().min(1),
  tourDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlotId: z.string().min(1),
  guests: z.number().int().positive(),
  mealOption: z.string().max(120).optional(),
  specialRequests: z.string().max(1000).optional(),
  paymentMethodKey: z.enum(['paypal', 'whatsapp-link', 'pay-on-day']),
  extras: z.array(z.object({ key: z.string().min(1).max(80), quantity: z.number().int().positive() })).default([]),
  turnstileToken: z.string().optional(),
});

function cors() {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers: cors() });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid booking payload', issues: parsed.error.issues }, { status: 400, headers: cors() });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers: cors() });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const payload = sanitizePayload(parsed.data);
  const ipHash = await hashIp(getClientIp(req));
  const rateLimit = {
    maxRequests: Number(Deno.env.get('BOOKING_RATE_LIMIT_MAX_REQUESTS') ?? '8'),
    windowMinutes: Number(Deno.env.get('BOOKING_RATE_LIMIT_WINDOW_MINUTES') ?? '15'),
  };
  const { data: allowed, error: rateError } = await supabase.rpc('check_booking_rate_limit', {
    p_ip_hash: ipHash,
    p_limit: Number.isFinite(rateLimit.maxRequests) ? rateLimit.maxRequests : 8,
    p_window_minutes: Number.isFinite(rateLimit.windowMinutes) ? rateLimit.windowMinutes : 15,
  });
  if (rateError) return Response.json({ message: 'Rate limit check failed' }, { status: 400, headers: cors() });
  if (!allowed) return Response.json({ message: 'Too many booking requests. Try again later.' }, { status: 429, headers: cors() });

  const turnstileOk = await verifyTurnstile(parsed.data.turnstileToken, req);
  if (!turnstileOk) return Response.json({ message: 'Human verification failed' }, { status: 403, headers: cors() });

  const { data, error } = await supabase.rpc('create_booking_transaction', { payload });

  if (error) {
    const message = error.message || 'Booking could not be created';
    const status = message.includes('already reserved') ? 409 : 400;
    return Response.json({ message }, { status, headers: cors() });
  }

  return Response.json(data, { status: 201, headers: cors() });
});

function clean(value?: string) {
  return value?.trim().replace(/\s+/g, ' ') ?? undefined;
}

function getClientIp(req: Request) {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

async function verifyTurnstile(token: string | undefined, req: Request) {
  if (areExternalProviderMocksAllowed()) return token === 'mock-valid-turnstile';
  if (!token) return false;
  const secret = Deno.env.get('CLOUDFLARE_TURNSTILE_SECRET_KEY');
  if (!secret) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  form.append('remoteip', getClientIp(req));

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const data = await response.json();
    const expectedHostname = Deno.env.get('TURNSTILE_EXPECTED_HOSTNAME');
    const expectedAction = Deno.env.get('TURNSTILE_BOOKING_ACTION');
    if (expectedHostname && data.hostname !== expectedHostname) return false;
    if (expectedAction && data.action !== expectedAction) return false;
    return response.ok && data.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function hashIp(value: string) {
  const secret = Deno.env.get('RATE_LIMIT_HASH_SECRET');
  if (!secret) throw new Error('Rate limit secret is not configured');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sanitizePayload(value: z.infer<typeof schema>) {
  return {
    customer: {
      fullName: clean(value.customer.fullName),
      email: clean(value.customer.email)?.toLowerCase(),
      whatsapp: clean(value.customer.whatsapp),
      country: clean(value.customer.country),
    },
    boatId: value.boatId,
    tourId: value.tourId,
    tourPackageId: value.tourPackageId,
    tourDate: value.tourDate,
    timeSlotId: value.timeSlotId,
    guests: value.guests,
    mealOption: clean(value.mealOption),
    specialRequests: clean(value.specialRequests),
    paymentMethodKey: value.paymentMethodKey,
    extras: value.extras.map((extra) => ({
      key: clean(extra.key),
      quantity: extra.quantity,
    })),
  };
}
