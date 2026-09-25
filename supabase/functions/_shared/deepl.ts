// The one place that knows how to call DeepL. translate-all-site-content (whole-catalog gap filler)
// and translate-texts (the Admin's "translate what I just typed on save") both use it, so there is a
// single integration, one endpoint and one error contract.
//
// Same call translate-all-site-content always made: same endpoint, same auth header. By default only
// target_lang is sent (DeepL auto-detects the source and returns text unchanged when it is already in the
// target language). translate-texts can also pin `source_lang` (e.g. the admin writes English, so EN -> ES).

export type DeeplTargetLang = 'ES' | 'EN';

export async function deeplTranslateBatch(texts: string[], targetLang: DeeplTargetLang, apiKey: string, sourceLang?: DeeplTargetLang): Promise<string[]> {
  if (texts.length === 0) return [];
  const response = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, target_lang: targetLang, ...(sourceLang ? { source_lang: sourceLang } : {}) }),
  });
  if (!response.ok) throw new Error(`DeepL request failed with status ${response.status}`);
  const body = await response.json();
  const translations = body?.translations;
  if (!Array.isArray(translations) || translations.length !== texts.length) throw new Error('DeepL response shape mismatch');
  return translations.map((entry: { text?: unknown }) => (typeof entry?.text === 'string' ? entry.text : ''));
}
