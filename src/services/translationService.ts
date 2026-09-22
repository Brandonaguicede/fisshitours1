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
 * The Admin's single "Traducir todo el sitio" button. Fills in whatever
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
