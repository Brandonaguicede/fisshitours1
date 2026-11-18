import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('supabase/functions/_shared/server-conversions.ts', 'utf8');
const context = vm.createContext({ crypto: globalThis.crypto, TextEncoder, URL, fetch, Response, Date, console });
vm.runInContext(ts.transpile(source.replace(/^export interface[\s\S]*?^}\r?\n/gm, '').replace(/^export /gm, ''), { target: ts.ScriptTarget.ES2022 }), context);

const transactionId = 'a'.repeat(64);
const purchase = (extra = {}) => ({
  transactionId, occurredAt: new Date(Date.now() - 60_000).toISOString(), value: 734.5, currency: 'USD',
  analyticsConsent: true, marketingConsent: true, gaClientId: '123456789.987654321', gaSessionId: '1234567890',
  email: ' Customer@Example.com ', phone: '8610 5784', fbp: 'fb.1.1700000000.abc123', fbc: 'fb.1.1700000000.xyz789',
  gclid: 'GCLID_TEST_123456789', ...extra,
});

test('GA4 and Meta share the opaque transaction id used for browser/server deduplication', async () => {
  const ga4 = context.buildGa4Purchase(purchase());
  const meta = await context.buildMetaPurchase(purchase(), 'https://papagayofishingtourcr.com/reservar');
  assert.equal(ga4.events[0].params.transaction_id, transactionId);
  assert.equal(meta.data[0].event_id, transactionId);
  assert.equal(meta.data[0].event_name, 'Purchase');
});

test('Meta hashes normalized email/phone and preserves valid browser match cookies', async () => {
  const event = (await context.buildMetaPurchase(purchase(), 'https://papagayofishingtourcr.com/reservar')).data[0];
  assert.match(event.user_data.em[0], /^[a-f0-9]{64}$/);
  assert.match(event.user_data.ph[0], /^[a-f0-9]{64}$/);
  assert.equal(event.user_data.fbp[0], 'fb.1.1700000000.abc123');
  assert.doesNotMatch(JSON.stringify(event), /customer@example|8610 5784|\+50686105784/i);
});

test('server payloads fail closed on consent, stale time, source and match data', async () => {
  assert.throws(() => context.buildGa4Purchase(purchase({ analyticsConsent: false })), /CONSENT/);
  assert.throws(() => context.buildGa4Purchase(purchase({ occurredAt: new Date(Date.now() - 73 * 3_600_000).toISOString() })), /TIME/);
  await assert.rejects(context.buildMetaPurchase(purchase(), 'https://evil.example/reservar'), /SOURCE/);
  await assert.rejects(context.buildMetaPurchase(purchase({ email: '', phone: '', fbp: '', fbc: '' }), 'https://papagayofishingtourcr.com/reservar'), /MATCH/);
});

test('GA4 validate and Meta test delivery keep secrets out of URLs/bodies where applicable', async () => {
  let ga4Request;
  const ga4 = await context.sendGa4Purchase(purchase(), {
    measurementId: 'G-KQDFR0ZVPW', apiSecret: 'server-only-secret', validateOnly: true,
    fetcher: async (url, init) => { ga4Request = { url: String(url), init }; return new Response(JSON.stringify({ validationMessages: [] }), { status: 200 }); },
  });
  assert.equal(ga4.accepted, true);
  assert.match(ga4Request.url, /\/debug\/mp\/collect/);
  assert.doesNotMatch(ga4Request.init.body, /server-only-secret/);

  let metaRequest;
  const meta = await context.sendMetaPurchase(purchase(), {
    datasetId: '1126431163430619', accessToken: 'server-token', graphVersion: 'v99.0', eventSourceUrl: 'https://papagayofishingtourcr.com/reservar', testEventCode: 'TEST123',
    fetcher: async (url, init) => { metaRequest = { url, init }; return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'trace-safe' }), { status: 200 }); },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(meta)), { accepted: true, retryable: false, status: 200, receipt: 'trace-safe' });
  assert.doesNotMatch(metaRequest.url, /server-token/);
  assert.equal(JSON.parse(metaRequest.init.body).test_event_code, 'TEST123');
});
