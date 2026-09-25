// DeepL is never called in tests: the Admin's translate-texts Edge Function is mocked. Every request is
// recorded in `calls` ({ texts, targetLang, sourceLang }); the answer is "<text> [ES]" for each text
// (English -> Spanish is the only direction the Admin uses). Flip `fails` / `empty` mid-test to simulate a
// DeepL outage or an empty translation.
export async function mockTranslation(page, options = {}) {
  const translation = { calls: [], fails: false, empty: false, ...options };
  await page.route('https://admin-test.supabase.co/functions/v1/translate-texts', async (route) => {
    const body = route.request().postDataJSON();
    translation.calls.push(body);
    if (translation.fails) return route.fulfill({ status: 502, json: { message: 'No se pudo traducir el texto. Intenta nuevamente.' } });
    if (translation.empty) return route.fulfill({ json: { translations: body.texts.map(() => '') } });
    return route.fulfill({ json: { translations: body.texts.map((text) => `${text} [${body.targetLang}]`) } });
  });
  return translation;
}

export const SPANISH_ERROR = 'No se pudo generar la traducción al español. Intenta nuevamente.';
