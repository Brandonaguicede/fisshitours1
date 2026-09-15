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
for (const name of ['calculate-booking-price', 'get-booking-availability']) {
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
      const payload = name === 'calculate-booking-price' ? { tourPackageId: 'package', boatId: 'boat', guests: 1 } : { boatId: 'boat', date: '2026-10-01' };
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
