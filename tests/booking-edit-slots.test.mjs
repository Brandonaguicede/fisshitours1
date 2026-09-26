// Reservation edits and the slot they hold: the availability-block trigger of the migration 202609260002 run on a real Postgres (PGlite) with
// a minimal bookings / availability_blocks schema. Covers: moving a booking never collides with ITSELF, a slot held by ANOTHER booking is
// rejected, a cancelled booking frees its slot immediately (and does not block edits or new bookings into it), re-confirming needs the slot
// to be free again, and every booking that becomes confirmed starts with calendar state 'pending'.
// (The overlap / buffer guards and update_booking_details are exercised against the real database in the functional QA.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync('supabase/migrations/202609260002_booking_edit_audit.sql', 'utf8');
const fn = (name) => {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  const end = migration.indexOf('\n$$;', start) + 4;
  assert.ok(start >= 0 && end > start, `function ${name} in the migration`);
  return migration.slice(start, end);
};

async function database() {
  const db = new PGlite();
  await db.exec(`
    create table public.bookings (id uuid primary key default gen_random_uuid(), booking_reference text not null, boat_id text not null, tour_date date not null, time_slot_id text not null,
      booking_status text not null, google_calendar_event_id text, google_calendar_sync_status text, google_calendar_sync_error text);
    create table public.availability_blocks (id uuid primary key default gen_random_uuid(), boat_id text not null, tour_date date not null, time_slot_id text not null, reason text, source text not null, booking_id uuid, active boolean not null default true);
    create unique index availability_blocks_one_active_slot on public.availability_blocks (boat_id, tour_date, time_slot_id) where active = true;
  `);
  // Stand-in for the real overlap guard (prevent_overlapping_boat_booking): another live booking on the same boat / date / slot -> conflict.
  // Like the real one it ignores the booking itself and cancelled bookings, and re-checks when a cancelled booking is reactivated.
  await db.exec(`
    create function public.guard_slot() returns trigger language plpgsql as $g$
    begin
      if new.booking_status = 'cancelled' then return new; end if;
      if exists (select 1 from public.bookings b where b.id is distinct from new.id and b.boat_id = new.boat_id and b.tour_date = new.tour_date and b.time_slot_id = new.time_slot_id
                   and b.booking_status in ('pending', 'pending_payment', 'pending_confirmation', 'confirmed', 'completed')) then
        raise exception 'BOAT_TIME_CONFLICT: The selected boat is no longer available for this time.';
      end if;
      return new;
    end $g$;
    create trigger bookings_guard_slot before insert or update of booking_status, boat_id, tour_date, time_slot_id on public.bookings for each row execute function public.guard_slot();
  `);
  await db.exec(fn('sync_booking_availability_block'));
  await db.exec(fn('mark_calendar_pending_on_confirm'));
  await db.exec(`
    create trigger bookings_sync_availability_block after insert or update of booking_status, boat_id, tour_date, time_slot_id on public.bookings for each row execute function public.sync_booking_availability_block();
    create trigger bookings_calendar_pending_on_confirm before update of booking_status on public.bookings for each row execute function public.mark_calendar_pending_on_confirm();
  `);
  return db;
}
const book = async (db, reference, slot = 'morning', date = '2026-12-01', status = 'confirmed') => (await db.query(`insert into public.bookings (booking_reference, boat_id, tour_date, time_slot_id, booking_status) values ($1, 'second-wind', $2, $3, $4) returning id`, [reference, date, slot, status])).rows[0].id;
const blocks = async (db, id) => (await db.query(`select time_slot_id, tour_date::text as tour_date, active from public.availability_blocks where booking_id = $1 order by active desc, time_slot_id`, [id])).rows;
const activeBlocks = async (db) => (await db.query(`select count(*)::int as n from public.availability_blocks where active`)).rows[0].n;

test('a confirmed booking holds ONE block; moving its time or date MOVES that block (no second block, no self-conflict)', async () => {
  const db = await database();
  const a = await book(db, 'A');
  assert.deepEqual(await blocks(db, a), [{ time_slot_id: 'morning', tour_date: '2026-12-01', active: true }]);
  // Same slot again (an edit that changes nothing operational).
  await db.query(`update public.bookings set booking_reference = 'A', time_slot_id = 'morning' where id = $1`, [a]);
  assert.equal(await activeBlocks(db), 1);
  // New time, then new date: the same block travels with the booking.
  await db.query(`update public.bookings set time_slot_id = 'midday' where id = $1`, [a]);
  assert.deepEqual(await blocks(db, a), [{ time_slot_id: 'midday', tour_date: '2026-12-01', active: true }]);
  await db.query(`update public.bookings set tour_date = '2026-12-02' where id = $1`, [a]);
  assert.deepEqual(await blocks(db, a), [{ time_slot_id: 'midday', tour_date: '2026-12-02', active: true }]);
  assert.equal(await activeBlocks(db), 1);
  await db.close();
});

test('moving a booking onto a slot held by ANOTHER confirmed booking is rejected and leaves both untouched', async () => {
  const db = await database();
  const a = await book(db, 'A', 'morning');
  const b = await book(db, 'B', 'midday');
  await assert.rejects(db.query(`update public.bookings set time_slot_id = 'midday' where id = $1`, [a]), /BOAT_TIME_CONFLICT/);
  assert.deepEqual(await blocks(db, a), [{ time_slot_id: 'morning', tour_date: '2026-12-01', active: true }]);
  assert.deepEqual(await blocks(db, b), [{ time_slot_id: 'midday', tour_date: '2026-12-01', active: true }]);
  assert.equal((await db.query(`select time_slot_id from public.bookings where id = $1`, [a])).rows[0].time_slot_id, 'morning');
  await db.close();
});

test('cancelling frees the slot immediately (the booking is kept): a new booking, or an edit, can take that slot', async () => {
  const db = await database();
  const a = await book(db, 'A', 'morning');
  const b = await book(db, 'B', 'midday');
  await db.query(`update public.bookings set booking_status = 'cancelled' where id = $1`, [a]);
  assert.deepEqual(await blocks(db, a), [{ time_slot_id: 'morning', tour_date: '2026-12-01', active: false }]);
  assert.equal((await db.query(`select count(*)::int as n from public.bookings where id = $1`, [a])).rows[0].n, 1, 'the cancelled booking is kept for history');
  // A brand new booking takes the freed slot...
  const c = await book(db, 'C', 'morning');
  assert.deepEqual(await blocks(db, c), [{ time_slot_id: 'morning', tour_date: '2026-12-01', active: true }]);
  // ...and another booking can be moved into a slot whose previous owner was cancelled.
  await db.query(`update public.bookings set booking_status = 'cancelled' where id = $1`, [c]);
  await db.query(`update public.bookings set time_slot_id = 'morning' where id = $1`, [b]);
  assert.deepEqual(await blocks(db, b), [{ time_slot_id: 'morning', tour_date: '2026-12-01', active: true }]);
  await db.close();
});

test('re-confirming a cancelled booking works while its slot is free and is REJECTED once someone else took it (no silent double booking)', async () => {
  const db = await database();
  const a = await book(db, 'A', 'morning');
  await db.query(`update public.bookings set booking_status = 'cancelled' where id = $1`, [a]);
  await db.query(`update public.bookings set booking_status = 'confirmed' where id = $1`, [a]);
  assert.deepEqual(await blocks(db, a), [{ time_slot_id: 'morning', tour_date: '2026-12-01', active: true }, { time_slot_id: 'morning', tour_date: '2026-12-01', active: false }]);
  await db.query(`update public.bookings set booking_status = 'cancelled' where id = $1`, [a]);
  const taker = await book(db, 'B', 'morning');
  await assert.rejects(db.query(`update public.bookings set booking_status = 'confirmed' where id = $1`, [a]), /BOAT_TIME_CONFLICT/);
  assert.equal((await db.query(`select booking_status from public.bookings where id = $1`, [a])).rows[0].booking_status, 'cancelled', 'still cancelled');
  assert.equal((await blocks(db, taker))[0].active, true);
  await db.close();
});

test('every booking that becomes confirmed starts with calendar state pending (also when it is confirmed again), and nothing else touches it', async () => {
  const db = await database();
  const id = await book(db, 'PAY', 'morning', '2026-12-01', 'pending_payment');
  const state = async () => (await db.query(`select google_calendar_sync_status as s, google_calendar_sync_error as e from public.bookings where id = $1`, [id])).rows[0];
  assert.deepEqual(await state(), { s: null, e: null }, 'not confirmed yet: nothing');
  await db.query(`update public.bookings set booking_status = 'confirmed' where id = $1`, [id]);
  assert.deepEqual(await state(), { s: 'pending', e: null });
  // The sync settles (synced), a later edit of another column does not reset it, a repeated "confirmed" write (duplicate webhook) neither.
  await db.query(`update public.bookings set google_calendar_sync_status = 'synced', google_calendar_event_id = 'evt' where id = $1`, [id]);
  await db.query(`update public.bookings set booking_status = 'confirmed', time_slot_id = 'midday' where id = $1`, [id]);
  assert.equal((await state()).s, 'synced');
  // Cancel then confirm again: a new sync is due.
  await db.query(`update public.bookings set booking_status = 'cancelled' where id = $1`, [id]);
  assert.equal((await state()).s, 'synced', 'cancelling alone does not change it (the Admin syncs the [CANCELADA] title)');
  await db.query(`update public.bookings set google_calendar_sync_error = 'old error' where id = $1`, [id]);
  await db.query(`update public.bookings set booking_status = 'confirmed' where id = $1`, [id]);
  assert.deepEqual(await state(), { s: 'pending', e: null });
  await db.close();
});
