import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { z } from 'zod';
import * as terms from '../supabase/functions/_shared/terms.mjs';

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
    z, console, Response, Deno: { env: { get: (key) => env[key] } }, ...terms, // imports are stripped from the transpiled sources, so the shared terms module is injected as globals
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
  const { context, supabase, booking } = fixture('paypal');
  booking.language = 'en'; // the confirmation is rendered in the language stored on the booking
  const messages = await context.getBookingConfirmationMessages(supabase, 'test-booking');
  for (const message of messages) {
    assert.match(message.html, /\$700\.00/);
    assert.match(message.html, /IVA \(13%\)/);
    assert.match(message.html, /\$91\.00/);
    assert.match(message.html, /\$791\.00/);
    assert.match(message.html, /7:00 AM/);
    assert.match(message.text, /IVA \(13%\): \$91\.00/);
    assert.doesNotMatch(message.html, /Morning|07:00:00/);
  }
  assert.match(messages[0].html, /Package subtotal/);
  assert.match(messages[0].html, /Departure Time/);
  assert.match(messages[0].text, /Departure Time: 7:00 AM/);
  assert.match(messages[0].html, /Please arrive at the departure location at least 15 minutes before the scheduled departure time\./);
  assert.match(messages[0].text, /lease arrive at the departure location at least 15 minutes before the scheduled departure time\./);
 });
 test('worker refresh reads the updated booking slot rather than queued departure', async () => {
  const { context, supabase, booking } = fixture('paypal');
  booking.language = 'en';
  const old = await context.getBookingConfirmationMessages(supabase, booking.id);
  assert.match(old[0].html, /7:00 AM/);
  booking.time_slots = { starts_at: '13:30:00', label: 'Old label' };
  const refreshed = await context.refreshBookingConfirmationNotification(supabase, 'notification');
  assert.match(refreshed.html, /Departure Time: 1:30 PM/);
  assert.match(refreshed.text, /Departure Time: 1:30 PM/);
  assert.doesNotMatch(refreshed.html, /7:00 AM|Old label/);
 });
 test('absent or invalid schedule omits departure time without inventing a time', async () => {
  const { context, supabase, booking } = fixture('paypal');
  booking.language = 'en';
  for (const slot of [null, { starts_at: '25:00:00', label: '7:00 AM' }, { label: 'Morning' }]) {
    booking.time_slots = slot;
    const messages = await context.getBookingConfirmationMessages(supabase, booking.id);
    for (const message of messages) {
      assert.doesNotMatch(message.html, /Departure Time|Hora de salida|7:00 AM/);
      assert.doesNotMatch(message.text, /Departure Time:|Hora de salida:/);
    }
  }
  assert.equal(context.formatDepartureTime('00:00:00'), '12:00 AM');
  assert.equal(context.formatDepartureTime('12:00:00'), '12:00 PM');
 });

// whatsapp-link is a manual-payment REQUEST. Since commit be056fa ("Delay WhatsApp customer email until manual payment confirmation", 2026-09-15) the
// customer gets no email at creation: their message is the WhatsApp chat they open themselves. The admin is alerted, and the customer's email is the
// normal CONFIRMATION once the admin confirms / marks the payment. This test pins the whole flow so the Pay-on-the-Day retirement cannot change it.
test('whatsapp-link end to end: creation alerts ONLY the admin (pending payment), and the customer receives the normal confirmation once the admin confirms', async () => {
  const { context, supabase, sent, notifications, booking } = fixture('whatsapp-link');
  assert.equal(booking.payment_status, 'pending');
  await context.sendBookingEmails(supabase, { booking_id: 'test-booking', booking_reference: 'PFT-TEST', booking_status: 'pending_payment', payment_status: 'pending' }, {
    customer: { fullName: 'Ana', email: 'customer@example.com', whatsapp: '0000000' }, paymentMethodKey: 'whatsapp-link',
  });
  assert.deepEqual(sent.map((message) => message.to), ['admin@example.com'], 'creation: only the admin is emailed');
  assert.match(sent[0].html, /Nueva reserva recibida/);
  assert.deepEqual(notifications.map((row) => row.dedupe_key), ['booking:test-booking:admin-email']);
  assert.equal(notifications.some((row) => row.dedupe_key.endsWith(':customer-email')), false, 'no "request received" customer email exists for this method');
  // Admin confirms and marks the payment: the customer's email is the standard confirmation (customer + admin copies).
  booking.payment_status = 'paid';
  const messages = await context.getBookingConfirmationMessages(supabase, 'test-booking');
  const customer = messages.find((message) => message.to === 'customer@example.com');
  assert.ok(customer, 'the customer gets the confirmation');
  assert.equal(customer.dedupe, 'booking:test-booking:paypal-confirmation-customer-email');
  assert.match(customer.subject, /Pago recibido y reserva confirmada|Payment received and booking confirmed/);
  assert.match(customer.html, /Pagado|Paid/);
  assert.ok(messages.some((message) => message.to === 'admin@example.com'));
});
