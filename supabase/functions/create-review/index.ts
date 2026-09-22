import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';

const schema = z.object({
  name: z.string().min(2).max(100),
  country: z.string().max(80).optional(),
  quote: z.string().min(10).max(1000),
  rating: z.number().int().min(1).max(5),
  tourId: z.string().optional(),
  boatId: z.string().optional(),
});

serve(withCors(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid review payload', issues: parsed.error.issues }, { status: 400, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

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
  const { quoteEs, quoteEn, translated } = await translateReview(cleanQuote);

  const { data, error } = await supabase.from('reviews').insert({
    name: sanitizeText(parsed.data.name),
    country: parsed.data.country ? sanitizeText(parsed.data.country) : null,
    quote: cleanQuote,
    quote_es: quoteEs,
    quote_en: quoteEn,
    translated,
    rating: parsed.data.rating,
    tour_id: parsed.data.tourId ?? null,
    boat_id: parsed.data.boatId ?? null,
    status: 'pending',
    featured: false,
  }).select('id, status').single();

  if (error) return Response.json({ message: 'Review could not be created' }, { status: 400, headers });
  return Response.json(data, { status: 201, headers });
}));

function sanitizeText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '');
}

// Translates a customer's review into both site languages so it always
// displays correctly regardless of which language the visitor selected —
// unlike the admin's site-content translator, this never blocks: if DeepL
// is unreachable or DEEPL_API_KEY is missing, both fields fall back to the
// original text (today's behavior) and `translated: false` lets the admin
// backfill tool retry it later.
async function translateReview(quote: string): Promise<{ quoteEs: string; quoteEn: string; translated: boolean }> {
  const apiKey = Deno.env.get('DEEPL_API_KEY');
  if (!apiKey || !quote) return { quoteEs: quote, quoteEn: quote, translated: false };

  try {
    // DeepL returns the text unchanged when it's already in the target
    // language, so translating to BOTH targets (source auto-detected)
    // always yields the correct ES and EN copies without needing to know
    // which language the customer wrote in.
    const [quoteEs, quoteEn] = await Promise.all([
      deeplTranslate(quote, 'ES', apiKey),
      deeplTranslate(quote, 'EN', apiKey),
    ]);
    return { quoteEs, quoteEn, translated: true };
  } catch (error) {
    console.error('create-review: translation failed, storing original text in both languages', error);
    return { quoteEs: quote, quoteEn: quote, translated: false };
  }
}

async function deeplTranslate(text: string, targetLang: 'ES' | 'EN', apiKey: string): Promise<string> {
  const response = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: [text], target_lang: targetLang }),
  });
  if (!response.ok) throw new Error(`DeepL request failed with status ${response.status}`);
  const body = await response.json();
  const value = body?.translations?.[0]?.text;
  if (typeof value !== 'string') throw new Error('DeepL response missing translated text');
  return value;
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
