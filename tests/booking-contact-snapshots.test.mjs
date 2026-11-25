// customer = reusable identity, booking = snapshot of the contact used for THAT reservation.
// Real migrations on PGlite (the project's booking schema + 202611240002 readers + 202611240003 writers), the real confirmation-email,
// Calendar and Admin-export code, and the leads migration for the conversion case.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as terms from '../supabase/functions/_shared/terms.mjs';
import * as bookingContact from '../supabase/functions/_shared/booking-contact.mjs';
import { buildEvent } from '../supabase/functions/_shared/google-calendar.mjs';
import { createBookingDb, bookingPayload, termsPayload } from './helpers/booking-db.mjs';
import { loadTs, plain } from './support/load-ts.mjs';

const read = (name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');
const SNAPSHOTS = read('202611240002_booking_contact_snapshots.sql');
const WRITERS = read('202611240003_booking_contact_writers.sql');
const phone = loadTs('src/utils/phoneNumber.ts', vm.createContext({}));
let day = 0;

const A = { fullName: 'Fernanda Mora', email: 'email-a@example.com', whatsapp: '+50611111111' };
const B = { fullName: 'Fernanda M. de Soto', email: 'email-b@example.com', whatsapp: '+50611111111' }; // same phone, everything else new

/** stage: 'legacy' = production today (no snapshots), 'readers' = + migration 1, 'full' = + migration 2 (final state). */
async function createDatabase({ stage = 'full' } = {}) {
  const fx = await createBookingDb();
  const { db } = fx;
  await db.exec(read('202609070001_customer_identity_protection.sql')); // present in production history until migration 2 drops it
  await db.exec(`create schema if not exists auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table booking_changes(booking_id uuid, changed_by uuid, reason text, changes jsonb);`);
  if (stage !== 'legacy') await db.exec(SNAPSHOTS);
  if (stage === 'full') await db.exec(WRITERS);
  const customers = async () => (await db.query('select id, full_name, email, whatsapp, country from customers order by created_at, id')).rows;
  const seed = async (fullName, email, whatsapp) => (await db.query('insert into customers (full_name, email, whatsapp) values ($1, $2, $3) returning id', [fullName, email, whatsapp])).rows[0].id;
  const book = async (customer, overrides = {}) => fx.create({ ...bookingPayload({ customer, tourDate: new Date(Date.UTC(2099, 0, 1) + (++day) * 86400000).toISOString().slice(0, 10), ...overrides }), ...termsPayload() });
  const row = async (booking) => (await db.query('select * from bookings where id = $1', [booking.booking_id])).rows[0];
  const listed = async (search = '') => plain((await db.query(`select list_admin_bookings($1, 'all', 'all', null, 0, 50) as r`, [search])).rows[0].r);
  const edit = (booking, customer, extra = {}) => db.query('select update_booking_details($1::jsonb)', [JSON.stringify({
    ...bookingPayload({ customer, tourDate: '2099-12-30' }), bookingId: booking.booking_id, paymentMethodKey: 'paypal', reason: 'contact fix', ...extra })]);
  return { ...fx, customers, seed, book, row, listed, edit };
}
const snapshot = (row) => ({ fullName: row.customer_name_snapshot, email: row.customer_email_snapshot, whatsapp: row.customer_whatsapp_snapshot });

// ---- Migration 1: columns + backfill ------------------------------------------------------------------------------------------------------

test('migration 1: backfill gives every existing booking the contact it shows today, without touching updated_at or firing triggers', async () => {
  const f = await createDatabase({ stage: 'legacy' });
  await f.db.exec(`create function bump() returns trigger language plpgsql as $$ begin new.updated_at := new.updated_at + interval '1 day'; return new; end $$;
    create trigger bump_bookings before update on bookings for each row execute function bump();`);
  const first = await f.book(A);
  const second = await f.book(B);       // the old writer overwrote the customer: both bookings show B today
  assert.deepEqual(plain(await f.customers()).map((c) => c.email), ['email-b@example.com']);
  const before = (await f.db.query('select id, updated_at from bookings order by id')).rows;
  await f.db.exec(SNAPSHOTS);
  const after = (await f.db.query('select id, updated_at, customer_name_snapshot as n, customer_email_snapshot as e, customer_whatsapp_snapshot as w from bookings order by id')).rows;
  assert.deepEqual(after.map((r) => r.updated_at.getTime()), before.map((r) => r.updated_at.getTime()), 'updated_at untouched');
  for (const r of after) assert.deepEqual([r.n, r.e, r.w], [B.fullName, B.email, B.whatsapp], 'looks exactly as it does today (the overwritten past cannot be reconstructed)');
  assert.equal((await f.db.query(`select tgenabled from pg_trigger where tgname = 'bump_bookings'`)).rows[0].tgenabled, 'O', 'user triggers are enabled again');
  assert.equal((await f.db.query('select count(*)::int as n from bookings where customer_name_snapshot is null')).rows[0].n, 0);
  assert.ok(first && second);
  // Re-running the backfill never replaces a snapshot that already exists.
  await f.db.query(`update bookings set customer_email_snapshot = 'kept@example.com'`);
  await f.db.exec(SNAPSHOTS);
  assert.equal((await f.db.query('select distinct customer_email_snapshot as e from bookings')).rows[0].e, 'kept@example.com');
});

test('migration 1 alone (readers deployed, writers not yet): a booking made by the old writer has no snapshot and every reader falls back to its customer', async () => {
  const f = await createDatabase({ stage: 'readers' });
  const booking = await f.book(A);
  const stored = await f.row(booking);
  assert.equal(stored.customer_name_snapshot, null, 'the old writer does not know the snapshots');
  const [listedRow] = (await f.listed()).rows;
  assert.deepEqual(listedRow.customers, { full_name: A.fullName, email: A.email, whatsapp: A.whatsapp }, 'listing falls back to the customer');
  assert.equal((await f.listed('email-a')).total, 1);
  assert.deepEqual(plain(bookingContact.getBookingContact({ ...stored, customers: { full_name: A.fullName, email: A.email, whatsapp: A.whatsapp } })), { fullName: A.fullName, email: A.email, whatsapp: A.whatsapp });
});

// ---- Migration 2: writers ---------------------------------------------------------------------------------------------------------------

test('history: booking 2 of the same customer never changes booking 1 nor the customer', async () => {
  for (const [label, second, match] of [
    ['same phone', B, 'phone'],
    ['same email', { fullName: 'Someone Else', email: A.email, whatsapp: '+50699999999' }, 'email'],
    ['legacy phone format', { fullName: 'Another Name', email: 'email-c@example.com', whatsapp: '+50685331728' }, 'legacy'],
  ]) {
    const f = await createDatabase();
    const first = match === 'legacy' ? await (async () => { await f.seed('Legacy Person', 'legacy@example.com', '85331728'); return f.book({ fullName: 'Legacy Person', email: 'legacy@example.com', whatsapp: '85331728' }); })() : await f.book(A);
    const customerBefore = plain(await f.customers());
    const booking2 = await f.book(second);
    assert.deepEqual(plain(await f.customers()), customerBefore, `${label}: the customer row is byte for byte the same (no overwrite, no duplicate)`);
    assert.equal((await f.customers()).length, 1, label);
    const [r1, r2] = [await f.row(first), await f.row(booking2)];
    assert.equal(r1.customer_id, r2.customer_id, `${label}: same customer identity`);
    assert.deepEqual(snapshot(r2), second, `${label}: booking 2 keeps exactly what was typed for it`);
    assert.notDeepEqual(snapshot(r1), snapshot(r2));
    if (match !== 'legacy') assert.deepEqual(snapshot(r1), A, `${label}: booking 1 still shows A`);
    else assert.deepEqual(snapshot(r1), { fullName: 'Legacy Person', email: 'legacy@example.com', whatsapp: '85331728' });
  }
});

test('a brand new person creates the customer once and the snapshot equals what was typed (email lower-cased, text trimmed)', async () => {
  const f = await createDatabase();
  const booking = await f.book({ fullName: '  Maria   Lopez ', email: ' MARIA@Example.COM ', whatsapp: ' +50622223333 ' });
  const stored = await f.row(booking);
  assert.deepEqual(snapshot(stored), { fullName: 'Maria   Lopez', email: 'maria@example.com', whatsapp: '+50622223333' });
  assert.equal((await f.customers()).length, 1);
  const manual = await f.book({ fullName: 'Walk In', email: '', whatsapp: '+50633334444' });
  assert.equal((await f.row(manual)).customer_email_snapshot, null, 'a manual booking without email has no email, not the customer\'s');
});

test('the dead overwrite trigger is gone and nothing in the new migrations updates customers', async () => {
  const f = await createDatabase();
  assert.equal((await f.db.query(`select count(*)::int as n from pg_trigger where tgname = 'prevent_service_customer_overwrite'`)).rows[0].n, 0);
  assert.equal((await f.db.query(`select count(*)::int as n from pg_proc where proname = 'prevent_service_customer_overwrite'`)).rows[0].n, 0);
  for (const sql of [SNAPSHOTS, WRITERS]) assert.doesNotMatch(sql, /update\s+public\.customers/i);
  assert.equal((WRITERS.match(/create or replace function public\.create_booking_transaction/g) ?? []).length, 1, 'one single version of the booking function');
  assert.equal((SNAPSHOTS.match(/create_booking_transaction/g) ?? []).length, 0, 'migration 1 does not touch the booking function');
});

// ---- Confirmations --------------------------------------------------------------------------------------------------------------------

function loadConfirmation(rowFor) {
  const supabase = {
    from(table) {
      const query = { select() { return query; }, eq(_column, value) { query.id = value; return query; }, is: async () => ({ error: null }), update() { return query; },
        single: async () => ({ data: table === 'booking_notifications' ? {} : rowFor(query.id), error: null }),
        maybeSingle: async () => ({ data: { value: '50686105784' }, error: null }) };
      return query;
    },
    rpc: async () => ({ error: null }),
  };
  const context = vm.createContext({ console, Response, Deno: { env: { get: (key) => ({ BOOKING_ADMIN_EMAIL: 'admin@example.com' })[key] } }, ...terms, ...bookingContact });
  const source = fs.readFileSync('supabase/functions/_shared/booking-confirmation-email.ts', 'utf8').replace(/^﻿/, '').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  return (bookingId) => context.getBookingConfirmationMessages(supabase, bookingId);
}
const confirmationRow = async (f, booking) => {
  const stored = await f.row(booking);
  const customer = (await f.db.query('select full_name, email, whatsapp from customers where id = $1', [stored.customer_id])).rows[0];
  return {
    id: stored.id, booking_reference: stored.booking_reference, payment_method_key: 'paypal', payment_status: 'paid', tour_date: '2099-12-01', guests: 2, special_requests: null,
    language: 'en', terms_accepted: true, terms_version: 'v1', base_price_snapshot: 700, extra_guests_total_snapshot: 0, extras_total_snapshot: 0, departure_surcharge_snapshot: 0,
    subtotal_snapshot: 700, tax_rate_snapshot: 0.13, tax_amount_snapshot: 91, total_snapshot: 791, departure_location_name_snapshot: 'Dock',
    customer_name_snapshot: stored.customer_name_snapshot, customer_email_snapshot: stored.customer_email_snapshot, customer_whatsapp_snapshot: stored.customer_whatsapp_snapshot,
    customers: plain(customer), boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' }, tour_packages: { name: 'Half Day' }, time_slots: { starts_at: '07:00:00' },
  };
};

test('confirmations: each booking confirms to ITS email, and a pending booking never changes recipient because another booking came later', async () => {
  const f = await createDatabase();
  const first = await f.book(A);   // stays pending (e.g. WhatsApp link) until the Admin confirms it
  const second = await f.book(B);  // the same person books again with another email
  const rows = new Map([[first.booking_id, await confirmationRow(f, first)], [second.booking_id, await confirmationRow(f, second)]]);
  const messages = loadConfirmation((id) => rows.get(id));
  const toFirst = await messages(first.booking_id);
  const toSecond = await messages(second.booking_id);
  const customerMessage = (list) => list.find((message) => message.to !== 'admin@example.com');
  assert.equal(customerMessage(toFirst).to, 'email-a@example.com', 'booking 1 is confirmed (late) to ITS email, not to the newer one');
  assert.match(customerMessage(toFirst).text, /Hi Fernanda Mora,/);
  assert.equal(customerMessage(toSecond).to, 'email-b@example.com');
  assert.match(customerMessage(toSecond).text, /Hi Fernanda M\. de Soto,/);
  assert.match(toFirst.find((message) => message.to === 'admin@example.com').text, /Correo: email-a@example\.com[\s\S]*WhatsApp: \+50611111111/);
  // The stored customer is still the original one, and it is NOT what the emails used.
  assert.equal((await f.customers())[0].email, 'email-a@example.com');
});

test('confirmations: a legacy booking without snapshot still confirms through its customer (fallback); a snapshotted booking without email sends nothing', async () => {
  const f = await createDatabase();
  const legacy = await confirmationRow(f, await f.book(A));
  const messages = loadConfirmation((id) => ({ ...legacy, id, customer_name_snapshot: null, customer_email_snapshot: null, customer_whatsapp_snapshot: null }));
  assert.equal((await messages('legacy')).find((m) => m.to !== 'admin@example.com').to, 'email-a@example.com');
  const noEmail = loadConfirmation((id) => ({ ...legacy, id, customer_email_snapshot: null }));
  assert.equal((await noEmail('x')).length, 0, 'an email the reservation does not have is not borrowed from the customer');
});

// ---- Admin ------------------------------------------------------------------------------------------------------------------------------

test('admin: editing the contact of booking 2 changes only booking 2 (not booking 1, not the customer); the country is no longer edited from there', async () => {
  const f = await createDatabase();
  const first = await f.book(A);
  const second = await f.book(B);
  await f.db.query(`update customers set country = 'Costa Rica'`);
  const customersBefore = plain(await f.customers());
  await f.edit(second, { fullName: 'Fernanda Fixed', email: 'fixed@example.com', whatsapp: '+50655556666', country: '' });
  assert.deepEqual(plain(await f.customers()), customersBefore, 'editing a reservation does not touch the customer (country included)');
  assert.deepEqual(snapshot(await f.row(first)), A, 'booking 1 unchanged');
  assert.deepEqual(snapshot(await f.row(second)), { fullName: 'Fernanda Fixed', email: 'fixed@example.com', whatsapp: '+50655556666' });
  await f.edit(second, { fullName: 'Fernanda Fixed', email: '', whatsapp: '+50655556666' });
  assert.equal((await f.row(second)).customer_email_snapshot, null, 'removing the email affects only that reservation');
});

test('admin: the listing returns the contact of each reservation under the legacy "customers" key, and the search uses the snapshots', async () => {
  const f = await createDatabase();
  const first = await f.book(A);
  const second = await f.book(B);
  const { rows, total } = await f.listed();
  assert.equal(total, 2);
  const byId = new Map(rows.map((r) => [r.id, r.customers]));
  assert.deepEqual(byId.get(first.booking_id), { full_name: A.fullName, email: A.email, whatsapp: A.whatsapp });
  assert.deepEqual(byId.get(second.booking_id), { full_name: B.fullName, email: B.email, whatsapp: B.whatsapp });
  assert.deepEqual((await f.listed('email-b')).rows.map((r) => r.id), [second.booking_id], 'a snapshot email finds only its reservation');
  assert.deepEqual((await f.listed('email-a')).rows.map((r) => r.id), [first.booking_id]);
  assert.deepEqual((await f.listed('de Soto')).rows.map((r) => r.id), [second.booking_id]);
  assert.equal((await f.listed('nobody-at-all')).total, 0);
  assert.match(SNAPSHOTS, /CONTACT OF THIS RESERVATION/, 'documented in the migration');
});

test('admin: the export carries the contact of each reservation', async () => {
  const f = await createDatabase();
  const first = await f.book(A);
  const second = await f.book(B);
  const rows = (await f.listed()).rows.map((r) => ({ ...r, boats: { name: 'Second Wind' }, tours: { title: 'Fishing Tour' }, time_slots: { label: 'Morning' } }));
  const exportCtx = vm.createContext({});
  loadTs('src/utils/reservationsExport.ts', exportCtx);
  const exported = plain(exportCtx.buildReservationExportRows(rows));
  const byReference = new Map(exported.map((r) => [r.reference ?? r.booking_reference ?? r.referencia, r]));
  const text = JSON.stringify(exported);
  assert.match(text, /email-a@example\.com/);
  assert.match(text, /email-b@example\.com/);
  assert.match(text, /Fernanda M\. de Soto/);
  assert.equal(text.split('email-a@example.com').length - 1, 1, 'booking 2 is not exported with the customer email');
  assert.ok(byReference && first && second);
});

// ---- Calendar / BAC ----------------------------------------------------------------------------------------------------------------------

const calendarBooking = (overrides) => ({
  id: 'b1', booking_reference: 'PFT-1', tour_date: '2099-12-01', guests: 2, tours: { title: 'Fishing Tour' }, boats: { name: 'Second Wind' },
  time_slots: { starts_at: '07:00:00' }, tour_packages: { name: 'Half Day', duration_minutes: 240 }, departure_location_name_snapshot: 'Dock', ...overrides });

test('calendar: the event shows the contact of the reservation, with a fallback to the customer for legacy rows', () => {
  const event = buildEvent(calendarBooking({
    customer_name_snapshot: 'Booking Contact', customer_email_snapshot: 'booking@example.com', customer_whatsapp_snapshot: '+50611112222',
    customers: { full_name: 'Current Profile', email: 'profile@example.com', whatsapp: '+50699998888' } }));
  assert.match(event.summary ?? event.title ?? JSON.stringify(event), /Booking Contact/);
  const text = JSON.stringify(event);
  assert.match(text, /booking@example\.com/);
  assert.match(text, /\+50611112222/);
  assert.doesNotMatch(text, /profile@example\.com|Current Profile|50699998888/);
  const legacy = JSON.stringify(buildEvent(calendarBooking({ customers: { full_name: 'Legacy Customer', email: 'legacy@example.com', whatsapp: '+50633334444' } })));
  assert.match(legacy, /Legacy Customer/);
  assert.match(legacy, /legacy@example\.com/);
  assert.match(fs.readFileSync('supabase/functions/_shared/google-calendar.mjs', 'utf8'), /customer_name_snapshot, customer_email_snapshot, customer_whatsapp_snapshot/, 'BOOKING_SELECT reads the snapshots');
});

test('bac: the payment uses the snapshot name / email of the booking (checked in the BAC test file) and reads them from the booking row', () => {
  const source = fs.readFileSync('supabase/functions/bac-process-payment/index.ts', 'utf8');
  assert.match(source, /select\('id, booking_reference, currency, customer_name_snapshot, customer_email_snapshot, customer_whatsapp_snapshot, customers\(full_name, email\)/);
  assert.match(source, /const contact = getBookingContact\(booking\)/);
  assert.match(source, /customer: \{ fullName: contact\.fullName, email: contact\.email \?\? '' \}/);
  assert.doesNotMatch(source, /customer\?\.full_name|customer\?\.email/);
});

test('every reader of a booking contact goes through the shared snapshot-first helper', () => {
  const readers = ['supabase/functions/_shared/booking-confirmation-email.ts', 'supabase/functions/_shared/google-calendar.mjs', 'supabase/functions/bac-process-payment/index.ts',
    'supabase/functions/admin-confirm-booking/index.ts', 'supabase/functions/admin-retry-confirmation-email/index.ts'];
  for (const file of readers) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /getBookingContact/, file);
    assert.doesNotMatch(source, /booking\??\.customers\??\.(full_name|email|whatsapp)/, `${file} must not read the customer directly`);
  }
  assert.match(fs.readFileSync('src/utils/dashboardMetrics.ts', 'utf8'), /row\.customer_name_snapshot \?\? row\.customers\?\.full_name/);
});

test('getBookingContact: snapshot first; a snapshotted booking keeps a null email; legacy rows fall back; array embeds work', () => {
  const { getBookingContact } = bookingContact;
  assert.deepEqual(plain(getBookingContact({ customer_name_snapshot: 'S', customer_email_snapshot: 's@x.co', customer_whatsapp_snapshot: '+1', customers: { full_name: 'C', email: 'c@x.co', whatsapp: '+2' } })), { fullName: 'S', email: 's@x.co', whatsapp: '+1' });
  assert.deepEqual(plain(getBookingContact({ customer_name_snapshot: 'S', customer_email_snapshot: null, customer_whatsapp_snapshot: '+1', customers: { full_name: 'C', email: 'c@x.co', whatsapp: '+2' } })), { fullName: 'S', email: null, whatsapp: '+1' });
  assert.deepEqual(plain(getBookingContact({ customer_name_snapshot: null, customers: [{ full_name: 'C', email: 'c@x.co', whatsapp: '+2' }] })), { fullName: 'C', email: 'c@x.co', whatsapp: '+2' });
  assert.deepEqual(plain(getBookingContact({})), { fullName: '', email: null, whatsapp: null });
});

// ---- Phone matching ---------------------------------------------------------------------------------------------------------------------

test('phone: legacy 85331728 and 506... formats reuse the customer; real international numbers stay different; nothing is overwritten', async () => {
  for (const legacy of ['85331728', '50685331728', '+506 8533 1728', '506-8533-1728', '0050685331728', '+50685331728']) {
    const f = await createDatabase();
    const legacyId = await f.seed('Legacy Person', 'legacy@example.com', legacy);
    const before = plain(await f.customers());
    const booking = await f.book({ fullName: 'Maria Lopez', email: 'maria.new@example.com', whatsapp: '+50685331728' });
    assert.equal((await f.row(booking)).customer_id, legacyId, legacy);
    assert.deepEqual(plain(await f.customers()), before, `${legacy}: the customer is untouched`);
    assert.deepEqual(snapshot(await f.row(booking)), { fullName: 'Maria Lopez', email: 'maria.new@example.com', whatsapp: '+50685331728' });
  }
  for (const [stored, incoming] of [['+44 7911 123456', '+50685331728'], ['+13055550100', '+50685331728'], ['+50685331728', '+50685331729'], ['85331728', '+4985331728'], ['612345678', '+34612345678']]) {
    const f = await createDatabase();
    const storedId = await f.seed('Stored Person', 'stored@example.com', stored);
    const booking = await f.book({ fullName: 'Maria Lopez', email: 'maria.new@example.com', whatsapp: incoming });
    assert.notEqual((await f.row(booking)).customer_id, storedId, `${stored} vs ${incoming}`);
    assert.equal((await f.customers()).length, 2, `${stored} vs ${incoming}`);
  }
});

test('phone: the same international number written with spaces, dashes or parentheses is one normalized value', () => {
  const variants = ['+44 7911 123456', '+44-7911-123456', '+44 (7911) 123456', '0044 7911 123456', '+447911123456', ' +44.7911.123456 '];
  assert.deepEqual([...new Set(variants.map((v) => plain(phone.parsePhoneNumber(v, 'CR')).e164))], ['+447911123456']);
  assert.deepEqual([...new Set(variants.map((v) => phone.phoneMatchKey(v)))], ['447911123456']);
  assert.deepEqual([...new Set(['8533 1728', '8533-1728', '(8533) 1728', '+506 8533 1728'].map((v) => plain(phone.parsePhoneNumber(v, 'CR')).e164))], ['+50685331728']);
});

test('phone: the SQL rule and the TypeScript rule agree on the same inputs', async () => {
  const { db } = await createDatabase();
  const inputs = ['85331728', '8533 1728', '50685331728', '+50685331728', '+506 8533 1728', '00506 8533 1728', '0050685331728', '(506) 8533-1728', '+44 7911 123456',
    '0044 7911 123456', '447911123456', '612345678', '+34612345678', '3055550100', '+13055550100', '12345678', '+12345678', '  +50685331728  ', '+', '00', '0', '', '   ', 'abc', 'ext 8533', '88881234', '+4988881234', null];
  for (const input of inputs) {
    assert.equal(phone.phoneMatchKey(input), (await db.query('select phone_match_key($1::text) as key', [input])).rows[0].key, `input ${JSON.stringify(input)}`);
  }
});

// ---- Leads ------------------------------------------------------------------------------------------------------------------------------

test('leads: converting a lead leaves a booking whose snapshots are exactly what was typed in that attempt; the lead then drops its personal data', async () => {
  const f = await createDatabase();
  await f.db.exec(`create function public.is_admin_editor_viewer() returns boolean language sql stable as $$ select true $$`);
  await f.db.exec(read('202611240001_booking_leads.sql'));
  const typed = { fullName: 'Ana Mora', email: 'ana@example.com', whatsapp: '+50688881234' };
  const token = '00000000-0000-4000-8000-000000000042';
  await f.db.query('select upsert_booking_lead($1::jsonb)', [JSON.stringify({ clientToken: token, language: 'es', customer: typed, context: {} })]);
  const booking = await f.book(typed);
  await f.db.query('select mark_booking_lead_converted($1, $2)', [token, booking.booking_id]);
  assert.deepEqual(snapshot(await f.row(booking)), typed, 'the booking keeps exactly the contact of the attempt');
  const lead = (await f.db.query('select status, booking_id, full_name, email, whatsapp from booking_leads')).rows[0];
  assert.deepEqual([lead.status, lead.booking_id, lead.full_name, lead.email, lead.whatsapp], ['converted', booking.booking_id, null, null, null]);
  assert.equal((await f.customers()).length, 1);
  // A returning customer converting a second attempt: still no overwrite, and the snapshot is the new attempt's contact.
  const token2 = '00000000-0000-4000-8000-000000000043';
  const again = { fullName: 'Ana M. Mora', email: 'ana.work@example.com', whatsapp: '+50688881234' };
  await f.db.query('select upsert_booking_lead($1::jsonb)', [JSON.stringify({ clientToken: token2, language: 'es', customer: again, context: {} })]);
  const second = await f.book(again);
  await f.db.query('select mark_booking_lead_converted($1, $2)', [token2, second.booking_id]);
  assert.deepEqual(snapshot(await f.row(second)), again);
  assert.deepEqual(snapshot(await f.row(booking)), typed);
  assert.equal((await f.customers())[0].email, 'ana@example.com');
});

// ---- Migrations --------------------------------------------------------------------------------------------------------------------------

test('migrations: new numbers in a safe order, the superseded intermediate migration is gone', () => {
  const names = fs.readdirSync('supabase/migrations').filter((n) => n.endsWith('.sql')).sort();
  const at = names.indexOf('202610310001_bac_security_hardening.sql');
  assert.deepEqual(names.slice(at + 1), ['202611240001_booking_leads.sql', '202611240002_booking_contact_snapshots.sql', '202611240003_booking_contact_writers.sql']);
  assert.ok(!names.some((n) => n.includes('phone_matching')));
  assert.match(WRITERS, /Apply ONLY after migration 202611240002 AND after the Edge Functions/);
});
