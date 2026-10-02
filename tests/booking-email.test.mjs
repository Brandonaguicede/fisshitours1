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
    guests: 2, base_price_snapshot: 700, subtotal_snapshot: 700, tax_rate_snapshot: 0.13, tax_amount_snapshot: 91, total_snapshot: 791, payment_method_key: paymentMethodKey,
    payment_status: paymentMethodKey === 'paypal' ? 'paid' : 'pending',
    customers: { full_name: '<b>Ana</b>', email: 'customer@example.com', whatsapp: '0000000' },
    boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' },
    tour_packages: { name: 'Half Day' }, time_slots: { label: 'Morning', starts_at: '07:00:00' },
  };
  const env = { RESEND_API_KEY: 'test-only', BOOKING_EMAIL_FROM: 'test@example.com', BOOKING_ADMIN_EMAIL: 'admin@example.com' };
  const supabase = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        single: async () => ({ data: table === 'booking_notifications' ? { id: 'notification', booking_id: booking.id, sent_at: null, dedupe_key: 'booking:test-booking:paypal-confirmation-customer-email' } : booking, error: null }),
        update(value) { notifications.push(value); return query; },
        is: async () => ({ error: null }),
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
    assert.match(sent.find((message) => message.to === 'admin@example.com').html, /Nueva reserva recibida/);
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
  const messages = await context.getBookingConfirmationMessages(supabase, 'test-booking', 'es');
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

 test('confirmation emails show persisted base, IVA, total and real departure in HTML and text', async () => {
  const { context, supabase } = fixture('paypal');
  const messages = await context.getBookingConfirmationMessages(supabase, 'test-booking', 'en');
  for (const message of messages) {
    assert.match(message.html, /\$700\.00/);
    assert.match(message.html, /IVA \(13%\)/);
    assert.match(message.html, /\$91\.00/);
    assert.match(message.html, /\$791\.00/);
    assert.match(message.html, /7:00 AM/);
    assert.match(message.text, /IVA \(13%\): \$91\.00/);
    assert.doesNotMatch(message.html, /Morning|07:00:00/);
  }
  assert.match(messages[0].html, /Package Price/);
  assert.match(messages[0].html, /Departure Time/);
  assert.match(messages[0].text, /Departure Time: 7:00 AM/);
  assert.match(messages[0].html, /Please arrive 15 minutes before your scheduled departure time\./);
  assert.match(messages[0].text, /Please arrive 15 minutes before your scheduled departure time\./);
 });
 test('worker refresh reads the updated booking slot rather than queued departure', async () => {
  const { context, supabase, booking } = fixture('paypal');
  const old = await context.getBookingConfirmationMessages(supabase, booking.id, 'en');
  assert.match(old[0].html, /7:00 AM/);
  booking.time_slots = { starts_at: '13:30:00', label: 'Old label' };
  const refreshed = await context.refreshBookingConfirmationNotification(supabase, 'notification', 'en');
  assert.match(refreshed.html, /Departure Time: 1:30 PM/);
  assert.match(refreshed.text, /Departure Time: 1:30 PM/);
  assert.doesNotMatch(refreshed.html, /7:00 AM|Old label/);
 });
 test('absent or invalid schedule omits departure time without inventing a time', async () => {
  const { context, supabase, booking } = fixture('paypal');
  for (const slot of [null, { starts_at: '25:00:00', label: '7:00 AM' }, { label: 'Morning' }]) {
    booking.time_slots = slot;
    const messages = await context.getBookingConfirmationMessages(supabase, booking.id, 'en');
    for (const message of messages) {
      assert.doesNotMatch(message.html, /Departure Time|Hora de salida|7:00 AM/);
      assert.doesNotMatch(message.text, /Departure Time:|Hora de salida:/);
    }
  }
  assert.equal(context.formatDepartureTime('00:00:00'), '12:00 AM');
  assert.equal(context.formatDepartureTime('12:00:00'), '12:00 PM');
 });
