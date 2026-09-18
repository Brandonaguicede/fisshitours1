import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders as getCorsHeaders, withCors } from '../_shared/cors.ts';

// CIERRE FUNCIONAL: the Admin only edits Spanish. This function is the
// server-side "translate + persist" step — the browser never calls the
// translation provider directly and never sees its API key.
//
// Contract: POST { fields: [{ key: 'home.hero.title', value: 'Nuevo título' }, ...] }
// `key` is the BASE site_settings key with no `.es`/`.en` suffix. On success
// this writes BOTH `${key}.es` and `${key}.en` and returns the translated
// pairs. On any failure (missing secret, provider error, DB error) it writes
// NOTHING — the caller's existing ES/EN rows are left untouched — and
// returns a message safe to show an admin directly (no provider internals).
interface TranslateField { key: string; value: string }

serve(withCors(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');
  const json = (body: unknown, status = 200) => jsonResponse(body, status, corsHeaders);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

    const auth = await requireEditor(req);
    if (!auth.ok) return json({ message: auth.message }, auth.status);

    let fields: TranslateField[];
    try {
      const body = await req.json();
      fields = Array.isArray(body?.fields) ? body.fields : [];
    } catch {
      return json({ message: 'Solicitud inválida.' }, 400);
    }
    if (fields.length === 0) return json({ message: 'No hay campos para traducir.' }, 400);
    for (const field of fields) {
      if (typeof field?.key !== 'string' || !field.key || typeof field?.value !== 'string') {
        return json({ message: 'Cada campo necesita una clave y un valor de texto.' }, 400);
      }
      if (!/^[a-z0-9_.]+$/i.test(field.key)) return json({ message: 'Clave de campo inválida.' }, 400);
    }

    // Provider: DeepL Free (recommended — simple REST, generous free tier,
    // no SDK needed). Swap `translateToEnglish` below to change provider;
    // nothing else in this function depends on it.
    const apiKey = Deno.env.get('DEEPL_API_KEY');
    if (!apiKey) {
      return json({ message: 'La traducción automática todavía no está configurada (falta el secret DEEPL_API_KEY en Supabase). Nada se guardó.' }, 503);
    }

    // Translate everything first — if any single field fails, nothing is
    // persisted, so ES and EN can never end up out of sync.
    let translated: Array<{ key: string; es: string; en: string }>;
    try {
      translated = await Promise.all(fields.map(async (field) => ({
        key: field.key,
        es: field.value,
        en: await translateToEnglish(field.value, apiKey),
      })));
    } catch (error) {
      console.error('translate-content: provider call failed', error);
      return json({ message: 'No se pudo traducir el contenido. Nada se guardó — intenta de nuevo.' }, 502);
    }

    const supabase = getServiceClient();
    const now = new Date().toISOString();
    const rows = translated.flatMap((field) => [
      { key: `${field.key}.es`, value: field.es, type: 'text', active: true, updated_at: now },
      { key: `${field.key}.en`, value: field.en, type: 'text', active: true, updated_at: now },
    ]);
    const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
    if (error) {
      console.error('translate-content: persistence failed', error);
      return json({ message: 'La traducción funcionó pero no se pudo guardar. Intenta de nuevo.' }, 500);
    }

    return json({ fields: translated });
  } catch (error) {
    console.error('translate-content failed', error);
    return json({ message: 'Internal server error' }, 500);
  }
}));

async function translateToEnglish(text: string, apiKey: string): Promise<string> {
  if (!text.trim()) return '';
  const response = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: [text], source_lang: 'ES', target_lang: 'EN' }),
  });
  if (!response.ok) throw new Error(`DeepL request failed with status ${response.status}`);
  const body = await response.json();
  const value = body?.translations?.[0]?.text;
  if (typeof value !== 'string') throw new Error('DeepL response missing translated text');
  return value;
}

function jsonResponse(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Same shape as storage-upload-image/index.ts's requireEditor — kept
// identical rather than shared, since Edge Functions each deploy standalone.
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
