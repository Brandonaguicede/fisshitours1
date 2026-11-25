import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync('supabase/migrations/202611150002_external_payment_measurement_outbox.sql', 'utf8');
const deliveryMigration = fs.readFileSync('supabase/migrations/202611150003_measurement_delivery_leases.sql', 'utf8');
const monitoringMigration = fs.readFileSync('supabase/migrations/202611150004_measurement_delivery_monitoring.sql', 'utf8');
const actorId = '00000000-0000-4000-8000-000000000010';
const bookingId = '00000000-0000-4000-8000-000000000020';
const transactionId = createHash('sha256').update(`pft-measurement-v1:booking:${bookingId}`).digest('hex');

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
    create table public.profiles (id uuid primary key references auth.users(id), active boolean not null, role text not null);
    create table public.bookings (id uuid primary key, created_at timestamptz not null, payment_method_key text not null,
      payment_status text not null, booking_status text not null, total_snapshot numeric(10,2) not null, currency text not null);
    create table public.measurement_attribution (booking_id uuid primary key references public.bookings(id), analytics_consent boolean not null, marketing_consent boolean not null);
    create function public.update_booking_status(uuid, text, text, text) returns jsonb language plpgsql as $$
    begin update public.bookings set booking_status=$2, payment_status=$3 where id=$1;
      return jsonb_build_object('booking_id',$1,'booking_status',$2,'payment_status',$3); end $$;
    create function public.digest(text, text) returns bytea language plpgsql immutable as $$
    begin if $1 <> 'pft-measurement-v1:booking:${bookingId}' or $2 <> 'sha256' then raise exception 'unexpected digest input'; end if;
      return decode('${transactionId}', 'hex'); end $$;
    insert into auth.users values ('${actorId}'); insert into public.profiles values ('${actorId}', true, 'admin');
    insert into public.bookings values ('${bookingId}', '2026-11-01T10:00:00Z', 'whatsapp-link', 'pending', 'pending_payment', 734.50, 'USD');
    insert into public.measurement_attribution values ('${bookingId}', true, true); select set_config('app.test_uid', '${actorId}', false);
  `);
  await db.exec(migration); await db.exec(deliveryMigration); await db.exec(monitoringMigration);
  return db;
}

const confirm = (db, { paidAt = '2026-11-01T12:00:00Z', amount = 734.50, reference = 'BAC-EXT-1001' } = {}) => db.query(
  `select public.confirm_external_bac_payment($1, $2, $3, 'USD', $4) result`, [bookingId, paidAt, amount, reference],
);

test('external BAC evidence, confirmation and one consent-scoped purchase are atomic and idempotent', async () => {
  const db = await database();
  try {
    const first = (await confirm(db)).rows[0].result;
    assert.equal(first.booking_status, 'confirmed'); assert.equal(first.payment_status, 'paid'); assert.equal(first.measurement_queued, true);
    await confirm(db);
    assert.equal((await db.query('select count(*)::int count from external_payment_evidence')).rows[0].count, 1);
    assert.equal((await db.query('select count(*)::int count from measurement_outbox')).rows[0].count, 1);
    const event = (await db.query('select event_key, payload, destinations from measurement_outbox')).rows[0];
    assert.equal(event.event_key, `purchase:external_bac_link:${bookingId}`);
    assert.equal(event.payload.transaction_id, transactionId);
    assert.equal(Number(event.payload.value), 734.5);
    assert.deepEqual(event.destinations, ['ga4', 'google_ads', 'meta']);
  } finally { await db.close(); }
});

test('mismatched or changed evidence fails without mutation or duplicate purchase', async () => {
  const db = await database();
  try {
    await assert.rejects(confirm(db, { amount: 700 }), /does not match/i);
    assert.deepEqual((await db.query('select booking_status, payment_status from bookings where id=$1', [bookingId])).rows[0], {
      booking_status: 'pending_payment', payment_status: 'pending',
    });
    await confirm(db);
    await assert.rejects(confirm(db, { reference: 'BAC-CHANGED' }), /immutable/i);
    assert.equal((await db.query('select count(*)::int count from measurement_outbox')).rows[0].count, 1);
  } finally { await db.close(); }
});

test('no measurement consent still confirms payment but creates no provider event', async () => {
  const db = await database();
  try {
    await db.query('update measurement_attribution set analytics_consent=false, marketing_consent=false where booking_id=$1', [bookingId]);
    const result = (await confirm(db)).rows[0].result;
    assert.equal(result.measurement_queued, false);
    assert.equal((await db.query('select count(*)::int count from measurement_outbox')).rows[0].count, 0);
    assert.equal((await db.query('select payment_status from bookings where id=$1', [bookingId])).rows[0].payment_status, 'paid');
  } finally { await db.close(); }
});
