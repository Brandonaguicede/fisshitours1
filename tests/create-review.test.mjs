import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

test('review without CAPTCHA is pending; validation and rate limit still apply', async () => {
  let handler, inserted, allowed = true;
  const context = vm.createContext({ Request, Response, Headers, TextEncoder, Uint8Array, crypto: webcrypto, z,
    console: { error() {} }, Deno: { env: { get: key => ({ SUPABASE_URL: 'https://test.example', SUPABASE_SERVICE_ROLE_KEY: 'test', RATE_LIMIT_HASH_SECRET: 'test-hash' })[key] } },
    serve: value => { handler = value; }, createClient: () => ({
      rpc: async (_, args) => { assert.equal(args.p_limit, 3); assert.match(args.p_ip_hash, /^[a-f0-9]{64}$/); return { data: allowed }; },
      from: () => ({ insert: row => { inserted = row; return { select: () => ({ single: async () => ({ data: { id: 'review-test', status: row.status } }) }) }; } }),
    }),
  });
  for (const file of ['supabase/functions/_shared/cors.ts', 'supabase/functions/create-review/index.ts']) {
    const source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(`{ ${ts.transpile(source, { target: ts.ScriptTarget.ES2022 })} }`, context);
  }
  const origin = 'https://www.papagayofishingtourcr.com';
  const request = payload => new Request('https://test.example', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const payload = { name: 'Test Client', quote: 'Excellent fishing experience', rating: 5, status: 'approved', featured: true };
  const response = await handler(request(payload));
  assert.equal(response.status, 201);
  assert.equal(inserted.status, 'pending'); assert.equal(inserted.featured, false);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal((await handler(request({ ...payload, rating: 0 }))).status, 400);
  allowed = false;
  const limited = await handler(request(payload));
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('access-control-allow-origin'), origin);
});
