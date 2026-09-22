import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders as getCorsHeaders, withCors } from '../_shared/cors.ts';

// One-time (repeatable) maintenance tool: reviews created before the
// quote_es/quote_en columns existed were backfilled with quote_es = quote_en
// = quote (see migration 202609210001) and marked translated = false. This
// function finds those rows and translates them with DeepL, same as
// create-review does for new submissions. Safe to call more than once —
// it only ever touches rows still marked translated = false, and processes
// them in small batches so one bad row can't fail the whole run.
const BATCH_SIZE = 25;

serve(withCors(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

    const auth = await requireEditor(req);
    if (!auth.ok) return json({ message: auth.message }, auth.status);

    const apiKey = Deno.env.get('DEEPL_API_KEY');
    if (!apiKey) return json({ message: 'La traducción automática todavía no está configurada (falta el secret DEEPL_API_KEY en Supabase).' }, 503);

    const supabase = getServiceClient();
    const { data: pending, error: fetchError } = await supabase
      .from('reviews')
      .select('id, quote')
      .eq('translated', false)
      .limit(BATCH_SIZE);

    if (fetchError) return json({ message: fetchError.message }, 500);
    if (!pending || pending.length === 0) return json({ translated: 0, remaining: 0 });

    let translatedCount = 0;
    const failures: string[] = [];

    for (const review of pending) {
      const quote: string = review.quote ?? '';
      if (!quote.trim()) {
        await supabase.from('reviews').update({ translated: true }).eq('id', review.id);
        continue;
      }
      try {
        const [quoteEs, quoteEn] = await Promise.all([
          deeplTranslate(quote, 'ES', apiKey),
          deeplTranslate(quote, 'EN', apiKey),
        ]);
        const { error: updateError } = await supabase
          .from('reviews')
          .update({ quote_es: quoteEs, quote_en: quoteEn, translated: true })
          .eq('id', review.id);
        if (updateError) throw updateError;
        translatedCount += 1;
      } catch (error) {
        console.error(`backfill-review-translations: failed for review ${review.id}`, error);
        failures.push(review.id);
      }
    }

    const { count: remaining } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('translated', false);

    return json({ translated: translatedCount, failed: failures.length, remaining: remaining ?? 0 });
  } catch (error) {
    console.error('backfill-review-translations failed', error);
    return json({ message: 'Internal server error' }, 500);
  }
}));

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

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Same shape as translate-content/index.ts's requireEditor — kept identical
// rather than shared, since Edge Functions each deploy standalone.
async function requireEditor(req: Request): Promise<
  | { ok: true; profile: { id: string; role: string } }
  | { ok: false; status: number; message: string }
> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, status: 401, message: 'Authentication required' };

  const supabase = getServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return { ok: false, status: 401, message: 'Invalid session' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', userData.user.id)
    .single();

  if (!profile?.active || !['admin', 'editor'].includes(profile.role)) {
    return { ok: false, status: 403, message: 'Admin or editor role required' };
  }
  return { ok: true, profile };
}
