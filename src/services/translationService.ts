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
