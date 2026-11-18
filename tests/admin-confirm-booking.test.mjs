import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

const externalPayment = { paidAt: '2026-10-01T18:00:00.000Z', amount: 350, currency: 'USD', providerReference: 'BAC-EXT-1001' };

async function confirm(method, options = {}) {
  const calls = []; let handler;
  const booking = { id: '00000000-0000-4000-8000-000000000001', booking_reference: 'PFT-TEST', payment_method_key: method,
    payment_status: 'pending', booking_status: 'pending_payment', tour_date: '2026-10-01', guests: 2, total_snapshot: 350,
    customers: { full_name: 'Ana', email: 'customer@example.com' } };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'test-admin' } }, error: null }) },
    from(table) {
      const query = { select() { return query; }, eq() { return query; }, single: async () => ({ data: booking, error: null }),
        maybeSingle: async () => ({ data: table === 'profiles' ? { role: 'admin', active: true } : { value: '50686105784' }, error: null }) };
      return query;
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'update_booking_status' || name === 'confirm_external_bac_payment') {
        booking.payment_status = name === 'confirm_external_bac_payment' ? 'paid' : args.p_payment_status;
        booking.booking_status = name === 'confirm_external_bac_payment' ? 'confirmed' : args.p_booking_status;
        return { data: { booking_id: booking.id, payment_status: booking.payment_status, booking_status: booking.booking_status,
          measurement_queued: name === 'confirm_external_bac_payment' }, error: null };
      }
      return { data: { queued: 1 }, error: null };
    },
  };
  const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only' };
  const context = vm.createContext({ z, Request, Response, Headers, console, createClient: () => client,
    serve: (value) => { handler = value; }, Deno: { env: { get: (key) => env[key] } } });
  for (const file of ['_shared/cors', '_shared/booking-confirmation-email', 'admin-confirm-booking/index']) {
    const source = fs.readFileSync(`supabase/functions/${file}.ts`, 'utf8').replace(/^\uFEFF/, '').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
    const js = ts.transpile(source, { target: ts.ScriptTarget.ES2022 });
    vm.runInContext(file.endsWith('/index') ? `{ ${js} }` : js, context);
  }
  const body = { bookingId: booking.id,
    ...(options.externalPayment === false ? {} : method === 'whatsapp-link' ? { externalPayment: options.externalPayment ?? externalPayment } : {}) };
  const response = await handler(new Request('https://edge.example', { method: 'POST',
    headers: { authorization: 'Bearer test-admin', origin: 'https://www.papagayofishingtourcr.com', 'content-type': 'application/json' },
    body: JSON.stringify(body) }));
  return { response, calls, booking };
}

test('WhatsApp confirmation records evidence, paid status and one queued measurement', async () => {
  const { response, calls } = await confirm('whatsapp-link');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.booking_status, 'confirmed'); assert.equal(result.payment_status, 'paid');
  assert.equal(result.emailQueued, true); assert.equal(result.measurementQueued, true);
  const evidenceCall = calls.find((call) => call.name === 'confirm_external_bac_payment');
  assert.deepEqual(JSON.parse(JSON.stringify(evidenceCall.args)), {
    p_booking_id: '00000000-0000-4000-8000-000000000001', p_paid_at: externalPayment.paidAt,
    p_amount: 350, p_currency: 'USD', p_provider_reference: 'BAC-EXT-1001',
  });
});

test('WhatsApp confirmation without evidence is rejected before status mutation', async () => {
  const { response, calls, booking } = await confirm('whatsapp-link', { externalPayment: false });
  assert.equal(response.status, 400); assert.equal(calls.length, 0);
  assert.equal(booking.payment_status, 'pending'); assert.equal(booking.booking_status, 'pending_payment');
});

test('malformed external references and fractional cents are rejected', async () => {
  for (const invalid of [{ ...externalPayment, providerReference: '<script>' }, { ...externalPayment, amount: 350.001 }]) {
    const { response, calls } = await confirm('whatsapp-link', { externalPayment: invalid });
    assert.equal(response.status, 400); assert.equal(calls.length, 0);
  }
});

test('unverified PayPal cannot be marked paid by manual confirmation', async () => {
  const { response, calls, booking } = await confirm('paypal');
  assert.equal(response.status, 409); assert.equal(calls.length, 0);
  assert.equal(booking.payment_status, 'pending'); assert.equal(booking.booking_status, 'pending_payment');
});
