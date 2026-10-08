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

async function bookingAlert(secrets) {
  const { calls, fetch } = resendCalls();
  const notifications = [];
  const context = runInContext('create-booking', {
    Deno: { env: envOf(secrets) }, fetch, serve() {}, withCors: (fn) => fn, corsHeaders: () => ({}), corsPreflight: () => new Response(null), createClient() {}, areExternalProviderMocksAllowed: () => false, checkTermsAcceptance: () => ({ ok: true, legacy: true }),
    buildBookingRequestAdminHtml: async () => '<p>alert</p>', buildBookingRequestSummary: async () => 'summary',
  });
  const supabase = { from: () => ({ insert: async (row) => { notifications.push(row); return { error: null }; } }) };
  await context.sendBookingEmails(supabase, { booking_id: 'b-1', booking_reference: 'PFT-1', booking_status: 'pending_payment', payment_status: 'pending' }, { customer: { fullName: 'Ana', email: 'ana@example.com', whatsapp: '5' }, paymentMethodKey: 'whatsapp-link', language: 'es' });
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
