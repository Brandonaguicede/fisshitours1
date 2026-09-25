import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

const origins = ['https://www.papagayofishingtourcr.com', 'https://papagayofishingtourcr.com', 'http://localhost:5173', 'http://localhost:3000'];
const env = {};
const context = vm.createContext({ Request, Response, Headers, console: { error() {} }, Deno: { env: { get: (key) => env[key] } }, z });
function evaluate(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
}
evaluate('supabase/functions/_shared/cors.ts');
function check(response, origin) {
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'authorization, x-client-info, apikey, content-type');
  assert.equal(response.headers.get('Vary'), 'Origin');
}
test('allowed origins: OPTIONS and every response status retain CORS', async () => {
  for (const origin of origins) {
    const preflight = await context.withCors(async () => { throw Error('must not run'); })(new Request('https://edge.example', { method: 'OPTIONS', headers: { origin } }));
    assert.equal(preflight.status, 204);
    check(preflight, origin);
    for (const status of [200, 400, 401, 403, 500]) {
      const response = await context.withCors(async () => Response.json({}, { status }))(new Request('https://edge.example', { headers: { origin } }));
      assert.equal(response.status, status);
      check(response, origin);
    }
    const failure = await context.withCors(async () => { throw Error('unexpected'); })(new Request('https://edge.example', { headers: { origin } }));
    assert.equal(failure.status, 500);
    check(failure, origin);
  }
});
test('allowlist rejects external, old and deceptive origins; preserves previews and explicit secret', () => {
  for (const origin of ['https://evil.example', 'https://papagayofishingtours.com', 'https://www.papagayofishingtours.com', 'https://www.papagayofishingtourcr.com.evil.example', 'null']) {
    assert.equal(context.getAllowedOrigin(new Request('https://edge.example', { headers: { origin } })), null);
  }
  assert.equal(context.getAllowedOrigin(new Request('https://edge.example')), null);
  const preview = 'https://fishshitours1-8yvz5sq2p-papagayo-fishingtour.vercel.app';
  assert.equal(context.getAllowedOrigin(new Request('https://edge.example', { headers: { origin: preview } })), preview);
  env.ALLOWED_ORIGIN = 'https://explicit.example';
  assert.equal(context.getAllowedOrigin(new Request('https://edge.example', { headers: { origin: env.ALLOWED_ORIGIN } })), env.ALLOWED_ORIGIN);
  delete env.ALLOWED_ORIGIN;
});

test('every Edge Function entrypoint returns allowed-origin preflight', async () => {
  const names = fs.readdirSync('supabase/functions', { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared').map((entry) => entry.name);
  for (const name of names) {
    let handler;
    context.serve = (value) => { handler = value; };
    const source = fs.readFileSync(`supabase/functions/${name}/index.ts`, 'utf8').replace(/^import .*;\r?\n/gm, '');
    vm.runInContext(`{ ${ts.transpile(source, { target: ts.ScriptTarget.ES2022 })} }`, context);
    for (const origin of origins.slice(0, 2)) {
      const response = await handler(new Request('https://edge.example', { method: 'OPTIONS', headers: { origin } }));
      assert.equal(response.status, 204, name);
      if (name === 'storage-delete-image') {
        assert.equal(response.headers.get('access-control-allow-methods'), 'POST, DELETE, OPTIONS');
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        assert.equal(response.headers.get('vary'), 'Origin');
      } else check(response, origin);
    }
  }
});

test('response wrapping preserves body, status, other Vary values and prevents wildcard leakage', async () => {
  const origin = origins[0];
  const handler = context.withCors(async () => Response.json({ ok: true }, {
    status: 403, headers: { Vary: 'Accept-Encoding', 'access-control-allow-origin': '*' },
  }), 'POST, DELETE, OPTIONS');
  const response = await handler(new Request('https://edge.example', { headers: { origin } }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('vary'), 'Accept-Encoding, Origin');
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, DELETE, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const denied = await handler(new Request('https://edge.example', { headers: { origin: 'https://evil.example' } }));
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
for (const name of ['calculate-booking-price', 'get-booking-availability', 'create-review']) {
  test(`${name}: actual handler preflight, invalid payload and unexpected failure`, async () => {
    let handler;
    context.serve = (value) => { handler = value; };
    context.createClient = () => { throw Error('simulated client failure'); };
    // Isolate each function's schema while using the real shared CORS helper.
    const source = fs.readFileSync(`supabase/functions/${name}/index.ts`, 'utf8').replace(/^import .*;\r?\n/gm, '');
    vm.runInContext(`{ ${ts.transpile(source, { target: ts.ScriptTarget.ES2022 })} }`, context);
    for (const origin of origins.slice(0, 2)) {
      const request = (method, body) => new Request('https://edge.example', { method, headers: { origin, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const preflight = await handler(request('OPTIONS'));
      assert.equal(preflight.status, 204);
      check(preflight, origin);
      const invalid = await handler(request('POST', {}));
      assert.equal(invalid.status, 400);
      check(invalid, origin);
      const payload = name === 'calculate-booking-price' ? { tourPackageId: 'package', boatId: 'boat', guests: 1 }
        : name === 'create-review' ? { name: 'Test Customer', quote: 'A wonderful fishing trip.', rating: 5 }
          : { boatId: 'boat', date: '2026-10-01' };
      const missingSecrets = await handler(request('POST', payload));
      assert.equal(missingSecrets.status, 500);
      check(missingSecrets, origin);
      env.SUPABASE_URL = 'https://supabase.example';
      env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
      const failure = await handler(request('POST', payload));
      assert.equal(failure.status, 500);
      check(failure, origin);
      delete env.SUPABASE_URL;
      delete env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });
}

test('send-contact-message: unexpected provider failure returns 500 with CORS', async () => {
  let handler;
  context.serve = (value) => { handler = value; };
  context.fetch = async () => { throw Error('simulated provider failure'); };
  const source = fs.readFileSync('supabase/functions/send-contact-message/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(`{ ${ts.transpile(source, { target: ts.ScriptTarget.ES2022 })} }`, context);
  env.RESEND_API_KEY = 'test-only';
  try {
    for (const origin of origins.slice(0, 2)) {
      const response = await handler(new Request('https://edge.example', {
        method: 'POST', headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Test Customer', email: 'test@example.com', message: 'A test contact request.' }),
      }));
      assert.equal(response.status, 500);
      check(response, origin);
    }
  } finally {
    delete env.RESEND_API_KEY;
  }
});

// ---- translate-texts: the Admin's EN -> ES translator (CORS, auth, payload validation, DeepL request/response) ----
// DeepL is mocked (fetch); nothing here calls the real API.
test('translate-texts: CORS, auth (401/403), payload validation, DeepL EN->ES request and error handling', async () => {
  evaluate('supabase/functions/_shared/deepl.ts');
  context.getCorsHeaders = context.corsHeaders;
  let handler;
  context.serve = (value) => { handler = value; };
  let profile = { id: 'u1', role: 'admin', active: true };
  context.createClient = () => ({
    auth: { getUser: async (token) => (token === 'good' ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
  });
  const deepl = [];
  let deeplResponse = (body) => ({ ok: true, status: 200, json: async () => ({ translations: body.text.map((text) => ({ text: `ES:${text}` })) }) });
  context.fetch = async (url, init) => { const body = JSON.parse(init.body); deepl.push({ url, headers: init.headers, body }); return deeplResponse(body); };
  const source = fs.readFileSync('supabase/functions/translate-texts/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(`{ ${ts.transpile(source, { target: ts.ScriptTarget.ES2022 })} }`, context);

  env.SUPABASE_URL = 'https://supabase.example';
  env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const origin = origins[0];
  const call = (method, { body, token = 'good', origin: requestOrigin = origin } = {}) => handler(new Request('https://edge.example', {
    method,
    headers: { origin: requestOrigin, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  }));
  const good = { texts: ['Fishing equipment included'], targetLang: 'ES', sourceLang: 'EN' };

  // CORS: allowed origin and preflight; an external origin never gets Allow-Origin.
  const preflight = await call('OPTIONS');
  assert.equal(preflight.status, 204);
  check(preflight, origin);
  assert.equal((await call('OPTIONS', { origin: 'https://evil.example' })).headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await call('GET')).status, 405);

  // Auth: no token / invalid token -> 401 (with CORS); a signed-in user without an editor/admin role -> 403.
  const anonymous = await call('POST', { body: good, token: null });
  assert.equal(anonymous.status, 401);
  check(anonymous, origin);
  assert.equal((await call('POST', { body: good, token: 'nope' })).status, 401);
  profile = { id: 'u1', role: 'customer', active: true };
  assert.equal((await call('POST', { body: good })).status, 403);
  profile = { id: 'u1', role: 'admin', active: false };
  assert.equal((await call('POST', { body: good })).status, 403);
  profile = { id: 'u1', role: 'editor', active: true };

  // Payload validation happens before DeepL is ever called.
  env.DEEPL_API_KEY = 'test-key-not-real';
  const invalid = [
    {}, 'not json', { texts: [], targetLang: 'ES' }, { texts: ['x'], targetLang: 'FR' }, { texts: [42], targetLang: 'ES' }, { texts: ['  '], targetLang: 'ES' },
    { texts: Array.from({ length: 51 }, (_, n) => `t${n}`), targetLang: 'ES', sourceLang: 'EN' },
    { texts: ['x'.repeat(10001)], targetLang: 'ES', sourceLang: 'EN' },
    { texts: Array.from({ length: 6 }, () => 'x'.repeat(9000)), targetLang: 'ES', sourceLang: 'EN' },
    { texts: ['x'], targetLang: 'ES', sourceLang: 'ES' },
  ];
  for (const body of invalid) {
    const response = await call('POST', { body });
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60));
    check(response, origin);
  }
  assert.equal(deepl.length, 0, 'an invalid request must never reach DeepL');

  // Happy path: EN -> ES, trimmed, one batch, order preserved; the key goes in the DeepL header, never in the response.
  const ok = await call('POST', { body: { texts: ['  Drinks  ', 'Snacks'], targetLang: 'ES', sourceLang: 'EN' } });
  assert.equal(ok.status, 200);
  check(ok, origin);
  assert.deepEqual(await ok.json(), { translations: ['ES:Drinks', 'ES:Snacks'] });
  assert.equal(deepl.length, 1);
  assert.equal(deepl[0].url, 'https://api-free.deepl.com/v2/translate');
  assert.deepEqual(deepl[0].body, { text: ['Drinks', 'Snacks'], target_lang: 'ES', source_lang: 'EN' });
  assert.match(deepl[0].headers.Authorization, /^DeepL-Auth-Key /);
  // Without sourceLang DeepL auto-detects (no source_lang sent) — used only by other callers, never by the Admin.
  await call('POST', { body: { texts: ['Hola'], targetLang: 'EN' } });
  assert.equal('source_lang' in deepl[1].body, false);

  // DeepL failures are 502 (never a fake translation); a missing secret is 503.
  deeplResponse = () => ({ ok: false, status: 456, json: async () => ({}) });
  assert.equal((await call('POST', { body: good })).status, 502);
  deeplResponse = (body) => ({ ok: true, status: 200, json: async () => ({ translations: body.text.map(() => ({ text: '  ' })) }) });
  assert.equal((await call('POST', { body: good })).status, 502);
  deeplResponse = () => ({ ok: true, status: 200, json: async () => ({ translations: [] }) });
  assert.equal((await call('POST', { body: good })).status, 502);
  delete env.DEEPL_API_KEY;
  assert.equal((await call('POST', { body: good })).status, 503);
  delete env.SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
});
