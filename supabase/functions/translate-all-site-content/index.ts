import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders as getCorsHeaders, withCors } from '../_shared/cors.ts';

// The site's "Traducir todo el sitio" button. Fills in ONLY missing English
// (or, for site_settings' already-bilingual Hero/About keys, whichever side
// is missing) — it never overwrites text that's already there, manual or
// translated. Safe to run repeatedly: a second run with nothing new to
// translate just reports everything as "sin cambios".
//
// Scope (see the audit delivered alongside this function for why):
//   - tours, tour_packages, tour_inclusions, boats, gallery_images,
//     payment_methods, departure_locations: each has exactly one
//     admin-authored field today, always written in Spanish, so we only add
//     and fill an _en counterpart. The original column stays the single
//     Spanish source of truth — admin forms are unchanged.
//   - site_settings (Hero/About): already has manually-editable .es/.en
//     pairs; this only fills a side an admin left blank.
//   - reviews: already has its own tested flow (create-review translates on
//     submit; backfill-review-translations catches old rows). This function
//     calls that existing Edge Function rather than re-implementing it, so
//     there's exactly one place that knows how to translate a review.
//
// Known limitation, accepted for this pass: if an admin edits the Spanish
// source again after it was translated, the _en column is NOT invalidated —
// this only fills gaps, it never re-translates. A `force` re-translate mode
// is a plausible future addition but deliberately left out for now.

interface FieldPair { source: string; target: string }
interface TableConfig { scalarFields: FieldPair[]; arrayFields: FieldPair[] }

const TABLE_JOBS: Record<string, TableConfig> = {
  tours: {
    scalarFields: [
      { source: 'title', target: 'title_en' },
      { source: 'description', target: 'description_en' },
      { source: 'long_description', target: 'long_description_en' },
      { source: 'image_alt', target: 'image_alt_en' },
    ],
    arrayFields: [
      { source: 'highlights', target: 'highlights_en' },
      { source: 'included', target: 'included_en' },
    ],
  },
  tour_packages: {
    scalarFields: [
      { source: 'name', target: 'name_en' },
      { source: 'description', target: 'description_en' },
    ],
    arrayFields: [{ source: 'package_included', target: 'package_included_en' }],
  },
  tour_inclusions: { scalarFields: [{ source: 'label', target: 'label_en' }], arrayFields: [] },
  boats: {
    scalarFields: [
      { source: 'badge', target: 'badge_en' },
      { source: 'featured_spec', target: 'featured_spec_en' },
    ],
    arrayFields: [],
  },
  gallery_images: {
    scalarFields: [
      { source: 'title', target: 'title_en' },
      { source: 'alt', target: 'alt_en' },
    ],
    arrayFields: [],
  },
  payment_methods: {
    scalarFields: [
      { source: 'description', target: 'description_en' },
      { source: 'instructions', target: 'instructions_en' },
    ],
    arrayFields: [],
  },
  departure_locations: { scalarFields: [{ source: 'description', target: 'description_en' }], arrayFields: [] },
};

const DISPLAY_NAMES: Record<string, string> = {
  tours: 'Tours',
  tour_packages: 'Paquetes',
  tour_inclusions: 'Inclusiones',
  boats: 'Botes',
  gallery_images: 'Galería',
  payment_methods: 'Métodos de pago',
  departure_locations: 'Ubicaciones de salida',
  site_settings: 'Secciones',
  reviews: 'Comentarios',
};

// Defensive cap, not a real-world limit: this fleet's tours/packages/boats/
// etc. number in the tens, never near this. Bounds worst-case runtime if the
// catalog ever grows a lot; a second click picks up anything left over.
const ROW_CAP = 200;
const DEEPL_BATCH_SIZE = 50;
const LOCK_KEY = 'system.translate_all_lock';
const LOCK_TTL_MS = 10 * 60 * 1000;
const MAX_REVIEW_BATCHES = 4; // backfill-review-translations does 25/call — up to 100 reviews per click here

interface TableResult { updated: number; skipped: number; errors: number }

serve(withCors(async (req) => {
  const corsHeadersValue = getCorsHeaders(req, 'POST, OPTIONS');
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeadersValue, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeadersValue });

  try {
    if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

    const auth = await requireEditor(req);
    if (!auth.ok) return json({ message: auth.message }, auth.status);

    const apiKey = Deno.env.get('DEEPL_API_KEY');
    if (!apiKey) return json({ message: 'La traducción automática todavía no está configurada (falta el secret DEEPL_API_KEY en Supabase).' }, 503);

    const supabase = getServiceClient();

    if (!(await acquireLock(supabase))) {
      return json({ message: 'Ya hay una traducción en curso. Intenta de nuevo en unos minutos.' }, 409);
    }

    try {
      const cache = new Map<string, string>();
      const failed = new Set<string>();
      const results: Record<string, TableResult> = {};

      for (const [table, config] of Object.entries(TABLE_JOBS)) {
        results[table] = await processTable(supabase, table, config, cache, failed, apiKey);
      }
      results.site_settings = await processSiteSettings(supabase, cache, failed, apiKey);

      const reviewsResult = await translateReviewsUmbrella(req.headers.get('Authorization'));
      results.reviews = { updated: reviewsResult.translated, skipped: 0, errors: reviewsResult.failed };

      const summary = Object.entries(results).map(([table, result]) => ({ table, label: DISPLAY_NAMES[table] ?? table, ...result }));
      const totalErrors = summary.reduce((sum, entry) => sum + entry.errors, 0);
      // The table caps above are generous enough that this fleet's real
      // catalog never hits them; reviews is the one queue that realistically
      // can have more pending than one click covers.
      const hasMore = reviewsResult.remaining > 0;

      return json({ results: summary, totalErrors, hasMore });
    } finally {
      await releaseLock(supabase);
    }
  } catch (error) {
    console.error('translate-all-site-content failed', error);
    return json({ message: 'Internal server error' }, 500);
  }
}));

// --- table content (tours, packages, boats, etc.) ---------------------------

async function processTable(
  supabase: ReturnType<typeof getServiceClient>,
  table: string,
  config: TableConfig,
  cache: Map<string, string>,
  failed: Set<string>,
  apiKey: string,
): Promise<TableResult> {
  const columns = [...new Set([
    'id',
    ...config.scalarFields.flatMap((field) => [field.source, field.target]),
    ...config.arrayFields.flatMap((field) => [field.source, field.target]),
  ])];

  const { data: rows, error } = await supabase.from(table).select(columns.join(', ')).order('id').limit(ROW_CAP);
  if (error) {
    console.error(`translate-all-site-content: failed to read ${table}`, error);
    return { updated: 0, skipped: 0, errors: 1 };
  }

  const pendingTexts = new Set<string>();
  for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
    for (const field of config.scalarFields) {
      const source = normalizeText(row[field.source]);
      const target = normalizeText(row[field.target]);
      if (source && !target) pendingTexts.add(source);
    }
    for (const field of config.arrayFields) {
      const sourceArr = normalizeArray(row[field.source]);
      const targetArr = normalizeArray(row[field.target]);
      if (sourceArr.length > 0 && targetArr.length === 0) sourceArr.forEach((item) => pendingTexts.add(item));
    }
  }
  await translateUnique(pendingTexts, 'EN', apiKey, cache, failed);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
    const patch: Record<string, unknown> = {};
    let rowHasWork = false;
    let rowHasError = false;

    for (const field of config.scalarFields) {
      const source = normalizeText(row[field.source]);
      const target = normalizeText(row[field.target]);
      if (!source || target) continue;
      rowHasWork = true;
      const key = cacheKey('EN', source);
      if (failed.has(key)) { rowHasError = true; continue; }
      patch[field.target] = cache.get(key) ?? source;
    }

    for (const field of config.arrayFields) {
      const sourceArr = normalizeArray(row[field.source]);
      const targetArr = normalizeArray(row[field.target]);
      if (sourceArr.length === 0 || targetArr.length > 0) continue;
      rowHasWork = true;
      const keys = sourceArr.map((item) => cacheKey('EN', item));
      if (keys.some((key) => failed.has(key))) { rowHasError = true; continue; }
      patch[field.target] = sourceArr.map((item) => cache.get(cacheKey('EN', item)) ?? item);
    }

    if (!rowHasWork) { skipped += 1; continue; }
    if (Object.keys(patch).length === 0) { errors += 1; continue; }

    const { error: updateError } = await supabase.from(table).update(patch).eq('id', row.id as string);
    if (updateError) {
      console.error(`translate-all-site-content: failed to update ${table}#${row.id}`, updateError);
      errors += 1;
      continue;
    }
    updated += 1;
    // A row can be both "updated" (some fields translated fine) and flagged
    // as an error (other fields on the same row failed) — both counts get
    // incremented so a failure is never silently swallowed by a partial
    // success.
    if (rowHasError) errors += 1;
  }

  return { updated, skipped, errors };
}

// --- site_settings (Hero/About .es/.en pairs) --------------------------------

interface SettingSide { key: string; value: string; type: string }

async function processSiteSettings(
  supabase: ReturnType<typeof getServiceClient>,
  cache: Map<string, string>,
  failed: Set<string>,
  apiKey: string,
): Promise<TableResult> {
  const { data: rows, error } = await supabase
    .from('site_settings')
    .select('key, value, type, active')
    .in('type', ['text', 'textarea'])
    .eq('active', true);
  if (error) {
    console.error('translate-all-site-content: failed to read site_settings', error);
    return { updated: 0, skipped: 0, errors: 1 };
  }

  const byBase = new Map<string, { es?: SettingSide; en?: SettingSide }>();
  for (const row of (rows ?? []) as Array<{ key: string; value: string; type: string }>) {
    if (row.key === LOCK_KEY) continue;
    const match = /^(.*)\.(es|en)$/.exec(row.key);
    if (!match) continue;
    const [, base, locale] = match;
    const entry = byBase.get(base) ?? {};
    entry[locale as 'es' | 'en'] = { key: row.key, value: row.value, type: row.type };
    byBase.set(base, entry);
  }

  const pendingEsToEn = new Set<string>();
  const pendingEnToEs = new Set<string>();
  for (const { es, en } of byBase.values()) {
    const esText = normalizeText(es?.value);
    const enText = normalizeText(en?.value);
    if (esText && !enText) pendingEsToEn.add(esText);
    else if (enText && !esText) pendingEnToEs.add(enText);
  }
  await translateUnique(pendingEsToEn, 'EN', apiKey, cache, failed);
  await translateUnique(pendingEnToEs, 'ES', apiKey, cache, failed);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (const [base, { es, en }] of byBase.entries()) {
    const esText = normalizeText(es?.value);
    const enText = normalizeText(en?.value);
    if ((esText && enText) || (!esText && !enText)) { skipped += 1; continue; }

    const fillingEn = Boolean(esText && !enText);
    const sourceText = fillingEn ? esText : enText;
    const targetLang: 'ES' | 'EN' = fillingEn ? 'EN' : 'ES';
    const key = cacheKey(targetLang, sourceText);
    if (failed.has(key)) { errors += 1; continue; }

    const newValue = cache.get(key) ?? sourceText;
    const newKey = fillingEn ? `${base}.en` : `${base}.es`;
    const type = (fillingEn ? es?.type : en?.type) ?? 'text';

    const { error: upsertError } = await supabase
      .from('site_settings')
      .upsert({ key: newKey, value: newValue, type, active: true, updated_at: now }, { onConflict: 'key' });
    if (upsertError) {
      console.error(`translate-all-site-content: failed to save site_settings.${newKey}`, upsertError);
      errors += 1;
      continue;
    }
    updated += 1;
  }

  return { updated, skipped, errors };
}

// --- reviews: delegates to the already-tested backfill function -------------

async function translateReviewsUmbrella(authHeader: string | null): Promise<{ translated: number; failed: number; remaining: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole || !authHeader) return { translated: 0, failed: 0, remaining: 0 };

  let translated = 0;
  let failedCount = 0;
  let remaining = 0;

  for (let i = 0; i < MAX_REVIEW_BATCHES; i++) {
    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/functions/v1/backfill-review-translations`, {
        method: 'POST',
        headers: { Authorization: authHeader, apikey: serviceRole, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('translate-all-site-content: could not reach backfill-review-translations', error);
      break;
    }
    if (!response.ok) {
      console.error(`translate-all-site-content: backfill-review-translations returned ${response.status}`);
      break;
    }
    const body = await response.json().catch(() => null) as { translated?: number; failed?: number; remaining?: number } | null;
    if (!body) break;
    translated += body.translated ?? 0;
    failedCount += body.failed ?? 0;
    remaining = body.remaining ?? 0;
    if (!remaining) break;
  }

  return { translated, failed: failedCount, remaining };
}

// --- DeepL, dedupe cache, small shared helpers -------------------------------

function cacheKey(targetLang: 'ES' | 'EN', text: string) {
  return `${targetLang}::${text}`;
}

async function translateUnique(
  texts: Set<string>,
  targetLang: 'ES' | 'EN',
  apiKey: string,
  cache: Map<string, string>,
  failed: Set<string>,
) {
  const pending = [...texts].filter((text) => !cache.has(cacheKey(targetLang, text)));
  for (let i = 0; i < pending.length; i += DEEPL_BATCH_SIZE) {
    const chunk = pending.slice(i, i + DEEPL_BATCH_SIZE);
    try {
      const translations = await deeplTranslateBatch(chunk, targetLang, apiKey);
      chunk.forEach((text, index) => cache.set(cacheKey(targetLang, text), translations[index] ?? text));
    } catch (error) {
      console.error(`translate-all-site-content: DeepL batch failed (${targetLang}, ${chunk.length} texts)`, error);
      chunk.forEach((text) => failed.add(cacheKey(targetLang, text)));
    }
  }
}

async function deeplTranslateBatch(texts: string[], targetLang: 'ES' | 'EN', apiKey: string): Promise<string[]> {
  if (texts.length === 0) return [];
  const response = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, target_lang: targetLang }),
  });
  if (!response.ok) throw new Error(`DeepL request failed with status ${response.status}`);
  const body = await response.json();
  const translations = body?.translations;
  if (!Array.isArray(translations) || translations.length !== texts.length) throw new Error('DeepL response shape mismatch');
  return translations.map((entry: { text?: unknown }) => (typeof entry?.text === 'string' ? entry.text : ''));
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

async function acquireLock(supabase: ReturnType<typeof getServiceClient>): Promise<boolean> {
  const { data } = await supabase.from('site_settings').select('value, updated_at').eq('key', LOCK_KEY).maybeSingle();
  if (data && Date.now() - new Date(data.updated_at as string).getTime() < LOCK_TTL_MS) return false;
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key: LOCK_KEY, value: new Date().toISOString(), type: 'text', active: false, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return !error;
}

async function releaseLock(supabase: ReturnType<typeof getServiceClient>) {
  await supabase.from('site_settings').delete().eq('key', LOCK_KEY);
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Same shape as translate-content's requireEditor used to be (and
// backfill-review-translations/index.ts still has it) — kept identical
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
