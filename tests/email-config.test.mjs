import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

// The official mailbox comes ONLY from configuration (Supabase secrets); no sender / recipient / reply-to is built into the code.
const OFFICIAL = 'reservas@papagayofishingtourcr.com';
const FROM = `Papagayo Fishing Tours <${OFFICIAL}>`;
const OLD_GMAIL = 'papagayofishingtourcr@gmail.com';
const SANDBOX = 'onboarding@resend.dev';

function runInContext(file, globals) {
  const source = fs.readFileSync(`supabase/functions/${file}/index.ts`, 'utf8').replace(/^﻿/, '').replace(/^import .*;\r?\n/gm, '');
  const context = vm.createContext({ console, Response, URL, TextEncoder, crypto: globalThis.crypto, z, ...globals });
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return context;
}
const envOf = (values) => ({ get: (key) => values[key] });
const resendCalls = () => { const calls = []; return { calls, fetch: async (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); } }; };

// ---- booking alerts sent straight to Resend by create-booking ----------------------------------------------------------------------------------

async function bookingAlert(secrets, paymentMethodKey = 'whatsapp-link') {
  const { calls, fetch } = resendCalls();
  const notifications = [];
  const context = runInContext('create-booking', {
    Deno: { env: envOf(secrets) }, fetch, serve() {}, withCors: (fn) => fn, corsHeaders: () => ({}), corsPreflight: () => new Response(null), createClient() {}, areExternalProviderMocksAllowed: () => false, checkTermsAcceptance: () => ({ ok: true, legacy: true }),
  });
  const supabase = { from: () => ({ insert: async (row) => { notifications.push(row); return { error: null }; } }) };
  await context.sendBookingEmails(supabase, { booking_id: 'b-1', booking_reference: 'PFT-1', booking_status: 'pending_payment', payment_status: 'pending' }, { customer: { fullName: 'Ana', email: 'ana@example.com', whatsapp: '5' }, paymentMethodKey, language: 'es' });
  return { calls, notifications };
}

test('create-booking: the admin alert goes From the official sender, To the official mailbox, with Reply-To from the secret', async () => {
  const { calls } = await bookingAlert({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_REPLY_TO: OFFICIAL });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].body.from, FROM);
  assert.equal(calls[0].body.to, OFFICIAL);
  assert.equal(calls[0].body.reply_to, OFFICIAL);
  assert.ok(!JSON.stringify(calls[0].body).includes(OLD_GMAIL) && !JSON.stringify(calls[0].body).includes(SANDBOX));
});

test('create-booking: without BOOKING_REPLY_TO no reply_to is sent (the value is read from the secret, never invented)', async () => {
  const { calls } = await bookingAlert({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_ADMIN_EMAIL: OFFICIAL });
  assert.equal(calls.length, 1);
  assert.ok(!('reply_to' in calls[0].body));
  const blank = await bookingAlert({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_REPLY_TO: '   ' });
  assert.ok(!('reply_to' in blank.calls[0].body), 'a blank secret is ignored');
});

// ---- new-booking notice to the admin: short, one per booking, no BCC -----------------------------------------------------------------------------

test('new-booking notice: exactly one short Spanish notice to BOOKING_ADMIN_EMAIL with the reference in subject and body', async () => {
  const secrets = { RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_REPLY_TO: OFFICIAL, BOOKING_CONFIRMATION_BCC: 'copias@example.org' };
  const { calls, notifications } = await bookingAlert(secrets);
  assert.equal(calls.length, 1, 'one email');
  assert.equal(notifications.length, 1, 'one recorded notification');
  const { body } = calls[0];
  assert.equal(body.to, OFFICIAL);
  assert.equal(body.from, FROM);
  assert.equal(body.reply_to, OFFICIAL);
  assert.equal(body.subject, 'Nueva solicitud de reserva - PFT-1');
  assert.equal(body.text, 'Se recibió una nueva solicitud de reserva.\n\nReserva: PFT-1\n\nIngresa al panel administrativo para revisarla.');
  assert.ok(!('html' in body) || body.html === undefined, 'plain text only');
  assert.ok(!('bcc' in body), 'no bcc on the admin notice (the confirmation bcc is only for customer confirmations)');
  assert.doesNotMatch(body.text, /ana@example\.com|\$|Total|Precio|Tour:|Bote/, 'no customer data, prices or tour summary');
});

test('new-booking notice: idempotency key is the per-booking one and PayPal bookings get no creation notice', async () => {
  const secrets = { RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_ADMIN_EMAIL: OFFICIAL };
  const { notifications } = await bookingAlert(secrets);
  assert.equal(notifications[0].dedupe_key, 'booking:b-1:admin-email');
  assert.ok(notifications[0].sent_at, 'recorded as sent');
  const paypal = await bookingAlert(secrets, 'paypal');
  assert.equal(paypal.calls.length, 0, 'PayPal is notified only after capture (existing behaviour)');
});

test('new-booking notice: without BOOKING_ADMIN_EMAIL nothing is sent or invented', async () => {
  const { calls, notifications } = await bookingAlert({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM });
  assert.equal(calls.length, 0);
  assert.equal(notifications.length, 0);
});

test('new-booking notice is never produced again by confirmations, payments or retries: they only use the paypal-confirmation-* keys', async () => {
  const messages = await confirmationMessages({ env: { BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_CONFIRMATION_BCC: 'copias@example.org' } });
  assert.equal(JSON.stringify(messages.map((message) => message.dedupe.split(':').pop()).sort()), JSON.stringify(['paypal-confirmation-admin-email', 'paypal-confirmation-customer-email']));
  assert.ok(messages.every((message) => !/Nueva solicitud de reserva/.test(message.subject)), 'the confirmations are different emails');
  assert.ok(messages.every((message) => !message.dedupe.endsWith(':admin-email') || message.dedupe.endsWith('paypal-confirmation-admin-email')), 'the creation key is never reused');
});

// ---- queue worker: customer + admin confirmations --------------------------------------------------------------------------------------------------

async function workerRun(secrets, message) {
  const { calls, fetch } = resendCalls();
  let dequeues = 0;
  const supabase = {
    rpc: async (name) => (name === 'dequeue_booking_email' ? { data: dequeues++ === 0 ? [{ msg_id: 1, message: { notification_id: 'n-1' } }] : [], error: null } : { error: null }),
    from: () => { const query = { select: () => query, eq: () => query, is: () => query, update: () => query, single: async () => ({ data: { id: 'n-1', payload: {}, sent_at: null }, error: null }), then: (resolve) => resolve({ error: null }) }; return query; },
  };
  let handler;
  const context = runInContext('process-booking-emails', {
    Deno: { env: envOf({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 's', SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'worker' }), ...secrets }) },
    fetch, serve: (fn) => { handler = fn; }, withCors: (fn) => fn, createClient: () => supabase, refreshBookingConfirmationNotification: async () => message,
  });
  void context;
  const response = await handler({ method: 'POST', headers: new Headers({ apikey: 'worker' }) });
  return { calls, body: await response.json(), status: response.status };
}

test('process-booking-emails: customer and admin confirmations carry the official From and the Reply-To from the secret', async () => {
  for (const to of ['cliente@example.com', OFFICIAL]) {
    const { calls, status, body } = await workerRun({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_REPLY_TO: OFFICIAL }, { to, subject: 'Confirmada', text: 't', html: '<p>h</p>' });
    assert.equal(status, 200);
    assert.equal(body.processed, 1);
    assert.equal(calls[0].body.from, FROM);
    assert.equal(calls[0].body.to, to);
    assert.equal(calls[0].body.reply_to, OFFICIAL);
    assert.equal(calls[0].headers['Idempotency-Key'], 'n-1', 'idempotency is unchanged');
    assert.ok(!JSON.stringify(calls[0].body).includes(OLD_GMAIL) && !JSON.stringify(calls[0].body).includes(SANDBOX));
  }
});

test('process-booking-emails: without BOOKING_REPLY_TO the send is unchanged (no reply_to)', async () => {
  const { calls } = await workerRun({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM }, { to: 'cliente@example.com', subject: 's', text: 't', html: '<p>h</p>' });
  assert.ok(!('reply_to' in calls[0].body));
});

// ---- contact form --------------------------------------------------------------------------------------------------------------------------------------

async function contact(secrets) {
  const { calls, fetch } = resendCalls();
  let handler;
  runInContext('send-contact-message', { Deno: { env: envOf(secrets) }, fetch, serve: (fn) => { handler = fn; }, withCors: (fn) => fn, corsHeaders: () => ({}), corsPreflight: () => new Response(null) });
  const response = await handler({ method: 'POST', json: async () => ({ name: 'Laura Visitante', email: 'laura@example.com', phone: '5', message: 'Hola, quiero informacion del tour.', language: 'es' }) });
  return { calls, status: response.status, body: await response.json() };
}

test('contact form: delivered to the official mailbox From the official sender; Reply-To stays the visitor so the team can answer them', async () => {
  const { calls, status, body } = await contact({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_ADMIN_EMAIL: OFFICIAL });
  assert.equal(status, 200);
  assert.deepEqual(body, { sent: true });
  assert.equal(calls[0].body.from, FROM);
  assert.deepEqual(calls[0].body.to, [OFFICIAL]);
  assert.equal(calls[0].body.reply_to, 'laura@example.com');
  assert.ok(!JSON.stringify(calls[0].body).includes(OLD_GMAIL) && !JSON.stringify(calls[0].body).includes(SANDBOX));
});

test('contact form FAILS CLOSED: any missing piece of configuration -> controlled 500, nothing is sent, no fallback address is invented', async () => {
  const complete = { RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_ADMIN_EMAIL: OFFICIAL };
  for (const missing of ['RESEND_API_KEY', 'BOOKING_EMAIL_FROM', 'BOOKING_ADMIN_EMAIL']) {
    for (const value of [undefined, '', '   ']) {
      const { calls, status, body } = await contact({ ...complete, [missing]: value });
      assert.equal(status, 500, `${missing}=${JSON.stringify(value)}`);
      assert.deepEqual(body, { message: 'Email service is not configured' });
      assert.equal(calls.length, 0, 'nothing is sent from an unexpected address');
    }
  }
});

// ---- nothing hardcoded in live code ----------------------------------------------------------------------------------------------------------------------

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|js|mjs|html|json|toml)$/.test(entry.name)) yield full;
  }
}
const live = [...walk('src'), ...walk('supabase/functions'), ...walk('api'), 'index.html', 'supabase/config.toml'];

test('live code has no sandbox sender and no old Gmail as an address; the public contact address is the official one', () => {
  const offenders = live.filter((file) => { const text = fs.readFileSync(file, 'utf8'); return text.includes(SANDBOX) || text.includes(OLD_GMAIL); });
  assert.deepEqual(offenders.map((file) => file.split(path.sep).join('/')), []);
  assert.match(fs.readFileSync('src/constants/contact.ts', 'utf8'), new RegExp(`CONTACT_EMAIL = '${OFFICIAL}'`));
  assert.match(fs.readFileSync('index.html', 'utf8'), new RegExp(`"email": "${OFFICIAL}"`));
});

test('the Edge Functions that send email read the reply-to / sender / recipient from secrets (no literal address in their source)', () => {
  for (const file of ['create-booking', 'process-booking-emails', 'send-contact-message']) {
    const source = fs.readFileSync(`supabase/functions/${file}/index.ts`, 'utf8');
    assert.doesNotMatch(source.replace(/\/\/.*$/gm, ''), /[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.(com|cr|net|org|dev)/, `${file} has no literal email address`);
  }
  assert.match(fs.readFileSync('supabase/functions/create-booking/index.ts', 'utf8'), /Deno\.env\.get\('BOOKING_REPLY_TO'\)/);
  assert.match(fs.readFileSync('supabase/functions/process-booking-emails/index.ts', 'utf8'), /Deno\.env\.get\('BOOKING_REPLY_TO'\)/);
});

// ---- hidden copy (BCC) of the customer's confirmation, from its own secret BOOKING_CONFIRMATION_BCC ----------------------------------------------

const BCC = 'copias@example.org';

function confirmationMessages({ env, customerEmail = 'cliente@example.com' }) {
  const booking = {
    id: 'b-1', booking_reference: 'PFT-TEST', payment_method_key: 'whatsapp-link', payment_status: 'pending', tour_date: '2027-03-02', guests: 2, special_requests: null, language: 'es',
    terms_accepted: false, terms_version: null, base_price_snapshot: 800, extra_guests_total_snapshot: 0, extras_total_snapshot: 0, departure_surcharge_snapshot: 0,
    subtotal_snapshot: 800, tax_rate_snapshot: 0.13, tax_amount_snapshot: 104, total_snapshot: 904, departure_location_name_snapshot: 'Playas del Coco',
    customers: { full_name: 'Ana', email: customerEmail, whatsapp: '50688888888' }, boats: { name: 'Boat' }, tours: { title: 'Tour' }, tour_packages: { name: 'Half day' }, time_slots: { starts_at: '07:00:00' },
  };
  const supabase = { from: () => { const query = { select: () => query, eq: () => query, single: async () => ({ data: booking, error: null }), maybeSingle: async () => ({ data: { value: '50686105784' }, error: null }) }; return query; } };
  const context = vm.createContext({ console, Response, Deno: { env: envOf(env) } });
  const source = fs.readFileSync('supabase/functions/_shared/booking-confirmation-email.ts', 'utf8').replace(/^﻿/, '').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return context.getBookingConfirmationMessages(supabase, 'b-1');
}
const customerMessage = (messages) => messages.find((message) => message.dedupe.endsWith('paypal-confirmation-customer-email'));

test('BCC: the customer confirmation uses BOOKING_CONFIRMATION_BCC and keeps the customer as the main recipient', async () => {
  const customer = customerMessage(await confirmationMessages({ env: { BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_CONFIRMATION_BCC: BCC } }));
  assert.equal(customer.to, 'cliente@example.com');
  assert.equal(customer.bcc, BCC, 'the address comes from its own secret');
});

test('BCC: BOOKING_ADMIN_EMAIL no longer determines the bcc; admin confirmation has none', async () => {
  const onlyAdmin = await confirmationMessages({ env: { BOOKING_ADMIN_EMAIL: OFFICIAL } });
  assert.ok(!('bcc' in customerMessage(onlyAdmin)), 'the admin address is not used as bcc');
  const both = await confirmationMessages({ env: { BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_CONFIRMATION_BCC: BCC } });
  const admin = both.find((message) => message.dedupe.endsWith('paypal-confirmation-admin-email'));
  assert.equal(admin.to, OFFICIAL);
  assert.ok(!('bcc' in admin));
  assert.equal(JSON.stringify(both.filter((message) => 'bcc' in message).map((message) => message.dedupe.split(':').pop())), JSON.stringify(['paypal-confirmation-customer-email']));
});

test('BCC: a missing/blank BOOKING_CONFIRMATION_BCC adds no copy and does not break the customer message', async () => {
  for (const value of [undefined, '', '   ']) {
    const messages = await confirmationMessages({ env: { BOOKING_ADMIN_EMAIL: OFFICIAL, ...(value === undefined ? {} : { BOOKING_CONFIRMATION_BCC: value }) } });
    const customer = customerMessage(messages);
    assert.equal(customer.to, 'cliente@example.com');
    assert.ok(customer.html && customer.text, 'the customer message is still produced');
    assert.ok(!('bcc' in customer));
  }
});

test('BCC: no duplicate when the customer already is the bcc address (trim + case-insensitive)', async () => {
  const messages = await confirmationMessages({ env: { BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_CONFIRMATION_BCC: BCC }, customerEmail: ` ${BCC.toUpperCase()} ` });
  assert.ok(!('bcc' in customerMessage(messages)));
  const padded = await confirmationMessages({ env: { BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_CONFIRMATION_BCC: `  ${BCC.toUpperCase()}  ` }, customerEmail: BCC });
  assert.ok(!('bcc' in customerMessage(padded)));
});

test('BCC: the worker sends to the customer with bcc as a separate field, keeping From and Reply-To; a message without bcc sends none', async () => {
  const withBcc = await workerRun({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_REPLY_TO: OFFICIAL }, { to: 'cliente@example.com', bcc: BCC, subject: 's', text: 't', html: '<p>h</p>' });
  assert.equal(withBcc.calls[0].body.to, 'cliente@example.com', 'bcc does not replace to');
  assert.equal(JSON.stringify(withBcc.calls[0].body.bcc), JSON.stringify([BCC]));
  assert.ok(!('cc' in withBcc.calls[0].body), 'it is a bcc, never a cc');
  assert.equal(withBcc.calls[0].body.from, FROM);
  assert.equal(withBcc.calls[0].body.reply_to, OFFICIAL);
  const without = await workerRun({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM }, { to: OFFICIAL, subject: 's', text: 't', html: '<p>h</p>' });
  assert.ok(!('bcc' in without.calls[0].body));
});

test('BCC: the contact form and the booking alert never add a bcc', async () => {
  const contactSend = await contact({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_CONFIRMATION_BCC: BCC });
  assert.ok(!('bcc' in contactSend.calls[0].body));
  const alert = await bookingAlert({ RESEND_API_KEY: 'k', BOOKING_EMAIL_FROM: FROM, BOOKING_ADMIN_EMAIL: OFFICIAL, BOOKING_REPLY_TO: OFFICIAL, BOOKING_CONFIRMATION_BCC: BCC });
  assert.ok(alert.calls.every((call) => !('bcc' in call.body)));
});
