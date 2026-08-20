import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { areExternalProviderMocksAllowed } from '../_shared/environment.ts';

const schema = z.object({
  name: z.string().min(2).max(100),
  country: z.string().max(80).optional(),
  quote: z.string().min(10).max(1000),
  rating: z.number().int().min(1).max(5),
  tourId: z.string().optional(),
  boatId: z.string().optional(),
  turnstileToken: z.string().optional(),
});

const headers = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid review payload', issues: parsed.error.issues }, { status: 400, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const turnstileOk = await verifyTurnstile(parsed.data.turnstileToken, req);
  if (!turnstileOk) return Response.json({ message: 'Human verification failed' }, { status: 403, headers });

  const ipHash = await hashIp(getClientIp(req));
  const { data: allowed, error: rateError } = await supabase.rpc('record_review_attempt', { p_ip_hash: ipHash, p_limit: 3 });
  if (rateError) return Response.json({ message: 'Rate limit check failed' }, { status: 400, headers });
  if (!allowed) return Response.json({ message: 'Too many review submissions. Try again later.' }, { status: 429, headers });

  if (parsed.data.boatId) {
    const { data: boat } = await supabase.from('boats').select('id').eq('id', parsed.data.boatId).eq('active', true).single();
    if (!boat) return Response.json({ message: 'Invalid boat' }, { status: 400, headers });
  }
  if (parsed.data.tourId) {
    const { data: tour } = await supabase.from('tours').select('id').eq('id', parsed.data.tourId).eq('active', true).single();
    if (!tour) return Response.json({ message: 'Invalid tour' }, { status: 400, headers });
  }

  const cleanQuote = sanitizeText(parsed.data.quote);
  const { data, error } = await supabase.from('reviews').insert({
    name: sanitizeText(parsed.data.name),
    country: parsed.data.country ? sanitizeText(parsed.data.country) : null,
    quote: cleanQuote,
    rating: parsed.data.rating,
    tour_id: parsed.data.tourId ?? null,
    boat_id: parsed.data.boatId ?? null,
    status: 'pending',
    featured: false,
  }).select('id, status').single();

  if (error) return Response.json({ message: 'Review could not be created' }, { status: 400, headers });
  return Response.json(data, { status: 201, headers });
});

function sanitizeText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '');
}

function getClientIp(req: Request) {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
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

async function verifyTurnstile(token: string, req: Request) {
  if (areExternalProviderMocksAllowed()) return token === 'mock-valid-turnstile';
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
    const expectedAction = Deno.env.get('TURNSTILE_REVIEW_ACTION') ?? Deno.env.get('TURNSTILE_EXPECTED_ACTION');
    if (expectedHostname && data.hostname !== expectedHostname) return false;
    if (expectedAction && data.action !== expectedAction) return false;
    return response.ok && data.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
