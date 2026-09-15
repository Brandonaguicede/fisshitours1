import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

function fixture(paymentMethodKey = 'whatsapp-link') {
  const sent = [];
  const notifications = [];
  const booking = {
    id: 'test-booking', booking_reference: 'PFT-TEST', tour_date: '2026-10-01',
    guests: 2, total_snapshot: 350, payment_method_key: paymentMethodKey,
    payment_status: paymentMethodKey === 'paypal' ? 'paid' : 'pending',
    customers: { full_name: '<b>Ana</b>', email: 'customer@example.com', whatsapp: '0000000' },
    boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' },
    tour_packages: { name: 'Half Day' }, time_slots: { label: '7:00 AM' },
  };
  const env = { RESEND_API_KEY: 'test-only', BOOKING_EMAIL_FROM: 'test@example.com', BOOKING_ADMIN_EMAIL: 'admin@example.com' };
  const supabase = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        single: async () => ({ data: booking, error: null }),
        maybeSingle: async () => ({ data: { value: '50686105784' }, error: null }),
        insert: async (value) => { notifications.push(value); return { error: null }; },
      };
      assert.ok(['bookings', 'site_settings', 'booking_notifications'].includes(table));
      return query;
    },
  };
  const context = vm.createContext({
    z, console, Response, Deno: { env: { get: (key) => env[key] } },
    serve() {}, withCors: (handler) => handler,
    fetch: async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); },
  });
  for (const file of ['_shared/booking-confirmation-email', 'create-booking/index']) {
    const source = fs.readFileSync(`supabase/functions/${file}.ts`, 'utf8').replace(/^\uFEFF/, '')
      .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
    vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  }
  return { context, supabase, sent, notifications, booking };
}

for (const method of ['pay-on-day']) {
  test(`${method}: actual sender includes existing branded HTML and records it`, async () => {
    const { context, supabase, sent, notifications } = fixture(method);
    await context.sendBookingEmails(supabase, {
      booking_id: 'test-booking', booking_reference: 'PFT-TEST', boat_id: 'boat-id',
      tour_id: 'tour-id', tour_package_id: 'package-id', tour_date: '2026-10-01',
      time_slot_id: 'slot-id', guests: 2, total_snapshot: 350,
      booking_status: 'pending_payment', payment_status: 'pending',
    }, { customer: { fullName: 'Ana', email: 'customer@example.com', whatsapp: '0000000' }, paymentMethodKey: method });
    assert.equal(sent.length, 2);
    const customer = sent.find((message) => message.to === 'customer@example.com');
    assert.ok(customer.text);
    assert.match(customer.html, /<!doctype html>/);
    assert.match(customer.html, /www\.papagayofishingtourcr\.com\/images\/papagayo-logo\.png/);
    assert.match(customer.html, /max-width:620px/);
    assert.match(customer.html, /Solicitud de reserva recibida/);
    assert.match(customer.html, /Pendiente/);
    assert.match(customer.html, /Second Wind/);
    assert.match(customer.html, /Half Day/);
    assert.match(customer.html, /&lt;b&gt;Ana&lt;\/b&gt;/);
    assert.doesNotMatch(customer.html, /Tu pago fue recibido|Pago recibido y reserva confirmada/);
    assert.equal(notifications.find((row) => row.dedupe_key.endsWith(':customer-email')).payload.html, customer.html);
    assert.equal(sent.find((message) => message.to === 'admin@example.com').html, undefined);
  });
}

test('WhatsApp request notifies the admin but sends no customer email before manual payment confirmation', async () => {
  const { context, supabase, sent, notifications } = fixture('whatsapp-link');
  await context.sendBookingEmails(supabase, { booking_id: 'test-booking', booking_reference: 'PFT-TEST' }, {
    customer: { email: 'customer@example.com' }, paymentMethodKey: 'whatsapp-link',
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'admin@example.com');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].dedupe_key, 'booking:test-booking:admin-email');
});

test('paid confirmation retains its existing branded template', async () => {
  const { context, supabase } = fixture('paypal');
  const messages = await context.getBookingConfirmationMessages(supabase, 'test-booking');
  const customer = messages.find((message) => message.to === 'customer@example.com');
  assert.match(customer.html, /Pago recibido y reserva confirmada/);
  assert.match(customer.html, /Tu pago fue recibido correctamente/);
  assert.match(customer.html, /max-width:620px/);
  assert.doesNotMatch(customer.html, /Solicitud de reserva recibida/);
});

test('PayPal creation still sends no confirmation before payment capture', async () => {
  const { context, supabase, sent, notifications } = fixture('paypal');
  await context.sendBookingEmails(supabase, { booking_id: 'test-booking' }, { customer: { email: 'customer@example.com' }, paymentMethodKey: 'paypal' });
  assert.equal(sent.length, 0);
  assert.equal(notifications.length, 0);
});
