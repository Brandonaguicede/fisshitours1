import { functionsUrl, supabase, supabasePublishableKey } from '../lib/supabase';

export interface TranslateFieldInput {
  /** Base site_settings key, no `.es`/`.en` suffix — e.g. "home.hero.title". */
  key: string;
  value: string;
}

export interface TranslatedField {
  key: string;
  es: string;
  en: string;
}

export class TranslationSessionExpiredError extends Error {
  constructor() {
    super('Tu sesión expiró. Inicia sesión nuevamente.');
    this.name = 'TranslationSessionExpiredError';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new TranslationSessionExpiredError();
  return { Authorization: `Bearer ${token}`, apikey: supabasePublishableKey };
}

/**
 * Sends Spanish field values to the `translate-content` Edge Function, which
 * translates them server-side and persists BOTH `${key}.es` and `${key}.en`
 * in `site_settings` atomically — it writes nothing at all if any field
 * fails to translate. Throws with a message safe to show the admin directly
 * (e.g. "la traducción automática todavía no está configurada") if it fails.
 */
export async function translateAndSaveContent(fields: TranslateFieldInput[]): Promise<TranslatedField[]> {
  if (fields.length === 0) return [];
  const headers = await authHeaders();
  const response = await fetch(`${functionsUrl}/translate-content`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body && typeof body.message === 'string' ? body.message : 'No se pudo traducir el contenido.');
  }
  return (body?.fields ?? []) as TranslatedField[];
}
