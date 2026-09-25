import { functionsUrl, supabase, supabasePublishableKey } from '../lib/supabase';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  return { Authorization: `Bearer ${token}`, apikey: supabasePublishableKey };
}

export interface BackfillReviewTranslationsResult {
  translated: number;
  failed?: number;
  remaining: number;
}

/**
 * One-time (repeatable) maintenance action: translates reviews created
 * before quote_es/quote_en existed, in batches of 25. Call again if
 * `remaining` is still greater than 0. New reviews are translated
 * automatically by create-review — this only backfills old rows.
 */
export async function backfillReviewTranslations(): Promise<BackfillReviewTranslationsResult> {
  const headers = await authHeaders();
  const response = await fetch(`${functionsUrl}/backfill-review-translations`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body && typeof body.message === 'string' ? body.message : 'No se pudo traducir los comentarios pendientes.');
  }
  return body as BackfillReviewTranslationsResult;
}

export interface TranslateAllSiteContentEntry {
  table: string;
  label: string;
  updated: number;
  skipped: number;
  errors: number;
}

export interface TranslateAllSiteContentResult {
  results: TranslateAllSiteContentEntry[];
  totalErrors: number;
  hasMore: boolean;
}

/**
 * The Admin's "Reparar traducciones antiguas" button (BACKFILL of legacy content only; normal saves use translateToSpanish). Fills in whatever
 * English (or, for Hero/About's .es/.en pairs, whichever side) is missing
 * across tours, packages, inclusions, boats, gallery, payment methods,
 * departure locations, site sections and reviews — never overwrites text
 * that's already there. Safe to call again; `hasMore` on the result means
 * there were more pending reviews than one call covers.
 */
export async function translateAllSiteContent(): Promise<TranslateAllSiteContentResult> {
  const headers = await authHeaders();
  const response = await fetch(`${functionsUrl}/translate-all-site-content`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body && typeof body.message === 'string' ? body.message : 'No se pudo completar la traducción del sitio.');
  }
  return body as TranslateAllSiteContentResult;
}

// ---------------------------------------------------------------------------------------------------
// Admin content translation: the administrator writes the public, commercial text in ENGLISH and DeepL
// generates the SPANISH copy when the content is saved (EN -> ES, the only direction used by the Admin).
// Edge Function: translate-texts (shares _shared/deepl.ts and DEEPL_API_KEY with translate-all-site-content).
// ---------------------------------------------------------------------------------------------------

export const DEFAULT_TRANSLATION_ERROR = 'No se pudo generar la traducción al español. Intenta nuevamente.';

export class TranslationError extends Error {
  /** True when the message says something specific (e.g. the DeepL secret is missing) rather than the generic retry text. */
  readonly custom: boolean;

  constructor(message?: string) {
    super(message ?? DEFAULT_TRANSLATION_ERROR);
    this.name = 'TranslationError';
    this.custom = Boolean(message);
  }
}

// translate-texts accepts up to 50 texts (and a bounded number of characters) per request.
const MAX_TEXTS_PER_REQUEST = 50;
const MAX_CHARS_PER_REQUEST = 40000;

/**
 * English -> Spanish for text the admin wrote in English. It only translates; the caller decides what to
 * persist. Call it from an explicit save, never per keystroke, and only for text that is new or changed.
 * Returns one translation per input, same order. Never returns an empty string: any failure (network,
 * function not deployed, DeepL error, malformed or empty answer) throws a TranslationError so the caller
 * can refuse to save instead of storing a blank/invented Spanish copy. Long lists go in sequential batches.
 */
export async function translateToSpanish(texts: string[]): Promise<string[]> {
  const results: string[] = [];
  let batch: string[] = [];
  let chars = 0;
  const flush = async () => {
    if (batch.length) results.push(...(await translateBatch(batch)));
    batch = [];
    chars = 0;
  };
  for (const text of texts) {
    if (batch.length >= MAX_TEXTS_PER_REQUEST || (batch.length > 0 && chars + text.length > MAX_CHARS_PER_REQUEST)) await flush();
    batch.push(text);
    chars += text.length;
  }
  await flush();
  return results;
}

/**
 * Translates every distinct non-empty text once (all fields of one save go out together) and returns
 * English -> Spanish by text, so each field can be matched with exactly its own translation.
 */
export async function translateTextsToSpanish(texts: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(texts.map((text) => text.trim()).filter(Boolean)));
  if (unique.length === 0) return new Map();
  const translated = await translateToSpanish(unique);
  return new Map(unique.map((text, index) => [text, translated[index]]));
}

async function translateBatch(texts: string[]): Promise<string[]> {
  let response: Response;
  try {
    const headers = await authHeaders();
    response = await fetch(`${functionsUrl}/translate-texts`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, targetLang: 'ES', sourceLang: 'EN' }),
    });
  } catch (caught) {
    throw new TranslationError(caught instanceof Error && caught.message.includes('sesión') ? caught.message : undefined);
  }
  const body = await response.json().catch(() => null) as { translations?: unknown; message?: unknown } | null;
  if (!response.ok) {
    // The function's own message is Spanish and admin-safe (e.g. DEEPL_API_KEY not configured).
    throw new TranslationError(response.status === 503 && typeof body?.message === 'string' ? body.message : undefined);
  }
  const translations = body?.translations;
  if (!Array.isArray(translations) || translations.length !== texts.length || translations.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TranslationError();
  }
  return (translations as string[]).map((item) => item.trim());
}
