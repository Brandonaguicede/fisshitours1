import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders as getCorsHeaders, withCors } from '../_shared/cors.ts';
import { deeplTranslateBatch } from '../_shared/deepl.ts';

// "Translate what the admin just typed", on demand. The ONE rule of the Admin: the administrator writes the
// public content in ENGLISH and DeepL generates the SPANISH (EN -> ES). Every Admin form (Tours, Botes,
// Paquetes, Hero/About, Lugares de salida, Galería...) sends only the new/changed English texts here when the
// admin presses a save/next button and persists both the English and the Spanish that comes back.
//
// It only TRANSLATES: it never reads or writes the database, so nothing is stored unless the caller
// stores it. It uses the same DEEPL_API_KEY secret, the same DeepL call (_shared/deepl.ts) and the
// same editor/admin check as translate-all-site-content — there is no second DeepL integration.
//
// Request : POST { "texts": [...], "targetLang": "EN" | "ES", "sourceLang"?: "EN" | "ES" }   (1-50 texts, <= 10000 chars each, <= 50000 in total)
//           sourceLang is optional (omitted = DeepL auto-detects). The Admin always sends sourceLang "EN" and
//           targetLang "ES" (see translationService.translateToSpanish).
// Response: 200 { "translations": ["Fish casado", ...] }   same order/length as `texts`
// Errors  : 400 bad payload, 401/403 auth, 502 DeepL failed or returned an empty translation,
//           503 DEEPL_API_KEY not configured. On any error the body is { "message": string }.

const MAX_TEXTS = 50;
// Long descriptions / About story are single texts of a few thousand characters.
const MAX_TEXT_LENGTH = 10000;
const MAX_TOTAL_LENGTH = 50000;

serve(withCors(async (req) => {
  const corsHeadersValue = getCorsHeaders(req, 'POST, OPTIONS');
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeadersValue, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeadersValue });

  try {
    if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

    const auth = await requireEditor(req);
    if (!auth.ok) return json({ message: auth.message }, auth.status);

    const payload = await req.json().catch(() => null) as { texts?: unknown; targetLang?: unknown; sourceLang?: unknown } | null;
    const targetLang = payload?.targetLang === 'ES' ? 'ES' : payload?.targetLang === 'EN' ? 'EN' : null;
    const sourceLang = payload?.sourceLang === 'ES' ? 'ES' : payload?.sourceLang === 'EN' ? 'EN' : undefined;
    const texts = payload?.texts;
    if (
      !targetLang
      || (payload?.sourceLang !== undefined && (!sourceLang || sourceLang === targetLang))
      || !Array.isArray(texts)
      || texts.length < 1
      || texts.length > MAX_TEXTS
      || texts.some((text) => typeof text !== 'string' || text.trim().length < 1 || text.trim().length > MAX_TEXT_LENGTH)
      || texts.reduce((sum: number, text: string) => sum + text.trim().length, 0) > MAX_TOTAL_LENGTH
    ) {
      return json({ message: `Invalid payload: send 1-${MAX_TEXTS} non-empty texts (max ${MAX_TEXT_LENGTH} characters) and targetLang "EN" or "ES".` }, 400);
    }

    const apiKey = Deno.env.get('DEEPL_API_KEY');
    if (!apiKey) return json({ message: 'La traducción automática todavía no está configurada (falta el secret DEEPL_API_KEY en Supabase).' }, 503);

    let translations: string[];
    try {
      translations = await deeplTranslateBatch((texts as string[]).map((text) => text.trim()), targetLang, apiKey, sourceLang);
    } catch (error) {
      console.error('translate-texts: DeepL failed', error);
      return json({ message: 'No se pudo traducir el texto. Intenta nuevamente.' }, 502);
    }
    // An empty translation is a failure, never something to store.
    if (translations.some((text) => !text.trim())) return json({ message: 'DeepL devolvió una traducción vacía. Intenta nuevamente.' }, 502);

    return json({ translations });
  } catch (error) {
    console.error('translate-texts failed', error);
    return json({ message: 'Internal server error' }, 500);
  }
}));

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Same check as translate-all-site-content's requireEditor (kept identical rather than shared, since
// Edge Functions each deploy standalone).
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
