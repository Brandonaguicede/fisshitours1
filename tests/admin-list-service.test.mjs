import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

function fixture(withCount = true) {
  const requests = [];
  const supabase = createClient('https://admin-test.supabase.co', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      requests.push({ url: new URL(url), init });
      return new Response(JSON.stringify([{ id: 'test-row' }]), { headers: withCount ? { 'content-range': '25-25/76' } : {} });
    } },
  });
  const context = vm.createContext({ supabase, JSON, Error, readWithAdminSession: async (query) => {
    const response = await query(); if (response.error) throw new Error(response.error.message); return response.data;
  } });
  const source = fs.readFileSync('src/services/adminListService.ts', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return { context, supabase, requests };
}

test('table pagination requests only the selected range with exact count and literal search', async () => {
  const { context, supabase, requests } = fixture();
  const text = 'Ana, (paid) "quoted" %_\\';
  const filter = context.adminSearchFilter(['name', 'country', 'quote'], text);
  const result = await context.getAdminTablePage(() => supabase.from('reviews').select('id, name', { count: 'exact' }).order('id').or(filter), 2, 25);
  assert.equal(result.total, 76); assert.equal(result.rows.length, 1);
  assert.equal(requests[0].url.searchParams.get('offset'), '25');
  assert.equal(requests[0].url.searchParams.get('limit'), '25');
  assert.equal(requests[0].url.searchParams.get('or'), `(${filter})`);
  assert.match(filter, /\\\\%/); assert.match(filter, /\\\\_/);
  assert.equal(new Headers(requests[0].init.headers).get('Prefer'), 'count=exact');
});

test('a missing backend count reports an error instead of displaying a false empty list', async () => {
  const { context, supabase } = fixture(false);
  await assert.rejects(context.getAdminTablePage(() => supabase.from('reviews').select('id', { count: 'exact' }), 1, 10), /No se pudo obtener el total/);
});
