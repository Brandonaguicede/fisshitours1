import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { resolveAvailableDepartures } from '../supabase/functions/_shared/boat-availability.mjs';

// The ONE comparison used everywhere is src/utils/format.ts (timeToMinutes / sortSlotsChronologically / normalizeTime / sortTimes).
const formatSource = ts.transpile(fs.readFileSync('src/utils/format.ts', 'utf8'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 });
const { normalizeTime, sortTimes, sortSlotsChronologically, timeToMinutes, formatTime } = await import(`data:text/javascript;base64,${Buffer.from(formatSource).toString('base64')}`);

// ---- hour normalization + chronological order (frontend defense, same rule as the database) ------------------------------------------------------

test('the unordered example from the requirements always comes out chronological (24h strings are never compared as text)', () => {
  assert.deepEqual(sortTimes(['16:30', '08:00', '12:00', '06:00', '11:30', '14:00']), ['06:00', '08:00', '11:30', '12:00', '14:00', '16:30']);
  assert.deepEqual(sortTimes(['4:30 PM', '8:00 AM', '12:00 PM', '6:00 AM', '11:30 AM', '2:00 PM']).map(formatTime), ['6:00 AM', '8:00 AM', '11:30 AM', '12:00 PM', '2:00 PM', '4:30 PM']);
  // Text order would put "10:00 AM" before "2:00 AM": impossible here.
  assert.deepEqual(sortTimes(['10:00 AM', '2:00 AM']).map(formatTime), ['2:00 AM', '10:00 AM']);
  assert.deepEqual(sortTimes(['9:00', '10:00', '2:00', '13:30']), ['02:00', '09:00', '10:00', '13:30']);
});

test('12 AM / 12 PM, minutes and every spelling normalize to one canonical HH:MM', () => {
  assert.equal(normalizeTime('12:00 AM'), '00:00');
  assert.equal(normalizeTime('12:00 PM'), '12:00');
  assert.equal(normalizeTime('12:30 AM'), '00:30');
  assert.equal(normalizeTime('12:30 pm'), '12:30');
  assert.equal(normalizeTime('11:45 AM'), '11:45');
  assert.equal(normalizeTime('2:30 PM'), '14:30');
  assert.equal(normalizeTime('1:45 PM'), '13:45');
  assert.equal(normalizeTime('8:00'), '08:00');
  assert.equal(normalizeTime('08:00'), '08:00');
  assert.equal(normalizeTime('08:00:00'), '08:00');
  assert.equal(normalizeTime('8:00 AM'), '08:00');
  for (const invalid of ['', '25:00', '8:60', 'noon', '13:00 PM', '0:00 AM']) assert.equal(normalizeTime(invalid), null, invalid);
  assert.deepEqual(sortTimes(['12:00 PM', '12:00 AM', '11:59 PM']), ['00:00', '12:00', '23:59']);
});

test('equivalent spellings are ONE hour (no duplicates), invalid values are dropped', () => {
  assert.deepEqual(sortTimes(['08:00', '8:00 AM', '8:00', '08:00:00', '2:00 PM', '14:00']), ['08:00', '14:00']);
  assert.deepEqual(sortTimes(['nope', '', '25:00', '09:15']), ['09:15']);
  assert.deepEqual(sortTimes([]), []);
});

test('sortSlotsChronologically keeps working on slot objects and does not mutate its input', () => {
  const slots = [{ id: 'c', time: '14:00' }, { id: 'a', time: '06:00' }, { id: 'b', time: '11:30' }];
  assert.deepEqual(sortSlotsChronologically(slots).map((slot) => slot.id), ['a', 'b', 'c']);
  assert.deepEqual(slots.map((slot) => slot.id), ['c', 'a', 'b']);
  assert.equal(timeToMinutes('1:30 PM'), 13 * 60 + 30);
});

// ---- availability resolver: general vs package-specific, always chronological -----------------------------------------------------------------

const row = (id, time, isGeneral) => ({ id, label: time, starts_at: `${time}:00`, ...(isGeneral === undefined ? {} : { is_general: isGeneral }) });
const resolve = (slots, departureTimes) => resolveAvailableDepartures({ slots, bookings: [], packages: [], timeSlots: [], durationMinutes: 60, departureTimes, blockedSlotIds: new Set(), operatingEnd: null });

test('a package that INHERITS offers only the general hours (a package-specific hour registered for another package is not inherited)', () => {
  const slots = [row('own', '13:30', false), row('g2', '11:30', true), row('g1', '07:00', true)];
  assert.deepEqual(resolve(slots, null).map((slot) => slot.id), ['g1', 'g2']);
});

test('a package with its OWN list offers exactly those hours, general or not, in chronological order', () => {
  const slots = [row('own', '13:30', false), row('g2', '11:30', true), row('g1', '07:00', true)];
  assert.deepEqual(resolve(slots, ['13:30', '07:00']).map((slot) => slot.id), ['g1', 'own']);
  assert.deepEqual(resolve(slots, []).map((slot) => slot.id), []);
});

test('rows that arrive in any order (ids, insertion order, sort_order) are returned chronologically; a missing flag counts as general (older callers)', () => {
  const slots = [row('x4', '16:30'), row('x1', '02:00'), row('x3', '12:00'), row('x2', '06:00'), row('x5', '23:15')];
  assert.deepEqual(resolve(slots, null).map((slot) => slot.id), ['x1', 'x2', 'x3', 'x4', 'x5']);
});

// ---- the database: real triggers + RPCs on PGlite ---------------------------------------------------------------------------------------------

const migration = (name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');

async function database({ withMigration = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create function public.is_editor_or_admin() returns boolean language sql as $$ select true $$;
    create table public.time_slots (id text primary key, label text not null, starts_at time not null, active boolean not null default true, sort_order int not null default 0);
    create table public.tour_packages (id text primary key, departure_times text[], meal_options jsonb not null default '[]'::jsonb, package_included text[]);
    create table public.bookings (id uuid primary key default gen_random_uuid(), tour_package_id text not null, time_slot_id text not null references public.time_slots(id), tour_date date, boat_id text, meal_option text);
    -- the seeded hours of the real project: sort_order 1..4 (this is what used to scramble the order)
    insert into public.time_slots (id, label, starts_at, sort_order) values ('morning','Morning','07:00',1),('midday','Midday','11:30',2),('afternoon','Afternoon','15:30',3),('evening','Evening','18:30',4);
    insert into public.time_slots (id, label, starts_at, sort_order) values ('departure-0200','02:00','02:00',120),('departure-0600','06:00','06:00',360);
  `);
  const settings = migration('202609150002_package_schedules_and_meals.sql');
  await db.exec(settings.slice(settings.indexOf('create or replace function public.prepare_package_settings()')));
  if (withMigration) await db.exec(migration('202610090002_time_slots_general_vs_package.sql'));
  const times = async (where = 'true') => (await db.query(`select to_char(starts_at,'HH24:MI') t from public.time_slots where ${where} order by starts_at`)).rows.map((r) => r.t);
  const general = () => times('active and is_general');
  const rpc = async (name, ...args) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as r`, args)).rows[0].r;
  return { db, times, general, rpc };
}
const rejects = (promise, pattern) => assert.rejects(promise, (error) => { assert.match(String(error.message), pattern); return true; });

test('migration: sort_order is derived from the hour (no more 1..4 vs minutes), existing hours stay general, one slot per hour', async () => {
  const { db, general } = await database();
  try {
    assert.deepEqual((await db.query('select id, sort_order from public.time_slots order by starts_at')).rows.map((r) => [r.id, r.sort_order]),
      [['departure-0200', 120], ['departure-0600', 360], ['morning', 420], ['midday', 690], ['afternoon', 930], ['evening', 1110]]);
    assert.deepEqual(await general(), ['02:00', '06:00', '07:00', '11:30', '15:30', '18:30']);
    await db.exec("update public.time_slots set sort_order = 9999 where id = 'morning'");
    assert.equal((await db.query("select sort_order from public.time_slots where id = 'morning'")).rows[0].sort_order, 420, 'nobody can set it by hand');
    await rejects(db.exec("insert into public.time_slots (id, label, starts_at) values ('dup','07:00','07:00')"), /time_slots_starts_at_key|duplicate key/);
  } finally { await db.close(); }
});

test('a package\'s OWN new hour is registered (bookings need the row) but NOT promoted to the general catalog', async () => {
  const { db, general, times } = await database();
  try {
    const before = await general();
    await db.exec("insert into public.tour_packages (id, departure_times) values ('own', array['07:00','13:30'])");
    assert.deepEqual(await general(), before, 'the general catalog is unchanged');
    assert.ok((await times()).includes('13:30'), 'the hour exists in time_slots so it can be booked');
    const registered = (await db.query("select active, is_general, sort_order from public.time_slots where starts_at = '13:30'")).rows[0];
    assert.deepEqual(registered, { active: true, is_general: false, sort_order: 810 });
    // Editing / dropping it from that package does not touch the catalog either.
    await db.exec("update public.tour_packages set departure_times = array['07:00','13:45'] where id = 'own'");
    assert.deepEqual(await general(), before);
  } finally { await db.close(); }
});

test('inheriting vs own list at BOOKING time: an inheriting package accepts only general hours; an own-list package accepts exactly its hours', async () => {
  const { db } = await database();
  try {
    await db.exec(`insert into public.tour_packages (id, departure_times) values ('inherit', null), ('own', array['13:30']);`);
    const slotAt = async (time) => (await db.query('select id from public.time_slots where starts_at = $1', [time])).rows[0].id;
    const book = (pkg, slotId) => db.query('insert into public.bookings (tour_package_id, time_slot_id, tour_date, boat_id) values ($1, $2, $3, $4)', [pkg, slotId, '2099-01-01', `b-${Math.random()}`]);
    await book('inherit', await slotAt('07:00')); // general
    await rejects(book('inherit', await slotAt('13:30')), /no está disponible/); // package-specific hour of ANOTHER package
    await book('own', await slotAt('13:30'));
    await rejects(book('own', await slotAt('07:00')), /no está disponible/); // general but not in its own list
  } finally { await db.close(); }
});

test('RPC create: persists a general hour, is idempotent, validates the format and never makes a second row for the same hour', async () => {
  const { db, general, times, rpc } = await database();
  try {
    assert.deepEqual(await rpc('admin_create_time_slot', '13:30'), { id: 'departure-1330', time: '13:30', created: true });
    assert.deepEqual(await rpc('admin_create_time_slot', '13:30'), { id: 'departure-1330', time: '13:30', created: false });
    assert.equal((await times("starts_at = '13:30'")).length, 1);
    assert.deepEqual(await general(), ['02:00', '06:00', '07:00', '11:30', '13:30', '15:30', '18:30'], 'chronological in the catalog');
    for (const bad of ['1:30 PM', '13:60', '24:00', '', 'abc']) await rejects(rpc('admin_create_time_slot', bad), /HH:MM/);
    // An hour that only existed for a package joins the catalog (same row, no duplicate).
    await db.exec("insert into public.tour_packages (id, departure_times) values ('own', array['16:45'])");
    assert.ok(!(await general()).includes('16:45'));
    await rpc('admin_create_time_slot', '16:45');
    assert.ok((await general()).includes('16:45'));
    assert.equal((await times("starts_at = '16:45'")).length, 1);
  } finally { await db.close(); }
});

test('RPC update 1:30 PM -> 1:45 PM: the catalog changes, inheriting packages see it, packages with their own list are NOT rewritten', async () => {
  const { db, general, rpc } = await database();
  try {
    await rpc('admin_create_time_slot', '13:30');
    await db.exec(`insert into public.tour_packages (id, departure_times) values ('inherits', null), ('own-with-1330', array['07:00','13:30']), ('own-without', array['07:00']);`);
    const result = await rpc('admin_update_time_slot', 'departure-1330', '13:45');
    assert.equal(result.changed, true);
    assert.equal(result.time, '13:45');
    assert.equal(result.old_time_kept_for_packages, true, 'a package still lists 13:30 as its own hour');
    const catalog = await general();
    assert.ok(catalog.includes('13:45') && !catalog.includes('13:30'));
    assert.deepEqual(catalog, ['02:00', '06:00', '07:00', '11:30', '13:45', '15:30', '18:30']);
    const packages = Object.fromEntries((await db.query('select id, departure_times from public.tour_packages')).rows.map((r) => [r.id, r.departure_times]));
    assert.equal(packages.inherits, null, 'inheriting packages hold no list: they see the new catalog by themselves');
    assert.deepEqual(packages['own-with-1330'], ['07:00', '13:30'], 'an own list that happens to contain 13:30 is left alone');
    assert.deepEqual(packages['own-without'], ['07:00']);
    // The old row stays usable ONLY for the package that lists it; it is no longer general.
    assert.deepEqual((await db.query("select active, is_general from public.time_slots where id = 'departure-1330'")).rows[0], { active: true, is_general: false });
    // Nothing else lists the old hour: editing it again drops the old row entirely.
    await db.exec("update public.tour_packages set departure_times = array['07:00'] where id = 'own-with-1330'");
    await rpc('admin_update_time_slot', 'departure-1345', '14:00');
    assert.deepEqual((await db.query("select active, is_general from public.time_slots where id = 'departure-1345'")).rows[0], { active: false, is_general: false });
  } finally { await db.close(); }
});

test('RPC update: duplicates, unknown slots, bad formats and a no-op are handled cleanly', async () => {
  const { rpc } = await database();
  await rejects(rpc('admin_update_time_slot', 'morning', '11:30'), /Ya existe un horario general a las 11:30/);
  await rejects(rpc('admin_update_time_slot', 'nope', '10:00'), /ya no existe/);
  await rejects(rpc('admin_update_time_slot', 'morning', '7:00 AM'), /HH:MM/);
  assert.deepEqual(await rpc('admin_update_time_slot', 'morning', '07:00'), { id: 'morning', time: '07:00', changed: false });
});

test('RPC update keeps existing bookings valid: the booking keeps its slot (and hour), only the offer changes', async () => {
  const { db, rpc, general } = await database();
  try {
    await db.exec("insert into public.tour_packages (id, departure_times) values ('p', null)");
    await db.exec("insert into public.bookings (tour_package_id, time_slot_id, tour_date, boat_id) values ('p', 'morning', '2099-01-01', 'b1')");
    await rpc('admin_update_time_slot', 'morning', '07:30');
    assert.deepEqual((await db.query("select to_char(s.starts_at,'HH24:MI') t from public.bookings b join public.time_slots s on s.id = b.time_slot_id")).rows, [{ t: '07:00' }], 'the booking still points at 07:00');
    const catalog = await general();
    assert.ok(catalog.includes('07:30') && !catalog.includes('07:00'));
    // An unrelated update of that booking does not trip the package rules (existing reservations keep their original hour).
    await db.exec("update public.bookings set meal_option = null where boat_id = 'b1'");
  } finally { await db.close(); }
});

test('RPC delete: the hour leaves the catalog (inheriting packages stop offering it); own lists, bookings and other hours are untouched', async () => {
  const { db, general, rpc } = await database();
  try {
    await db.exec(`insert into public.tour_packages (id, departure_times) values ('inherits', null), ('own', array['07:00','18:30']);`);
    const gone = await rpc('admin_delete_time_slot', 'morning');
    assert.equal(gone.kept_for_packages, true, 'the package "own" lists 07:00 as its own hour');
    assert.ok(!(await general()).includes('07:00'));
    assert.deepEqual((await db.query("select departure_times from public.tour_packages where id = 'own'")).rows[0].departure_times, ['07:00', '18:30']);
    const dropped = await rpc('admin_delete_time_slot', 'departure-0200');
    assert.equal(dropped.kept_for_packages, false);
    assert.deepEqual((await db.query("select active, is_general from public.time_slots where id = 'departure-0200'")).rows[0], { active: false, is_general: false }, 'soft delete: never a hard delete');
    assert.equal(dropped.general_left, (await general()).length);
    await rejects(rpc('admin_delete_time_slot', 'departure-0200'), /ya no existe/);
    // Re-creating a deleted hour brings it back (same row).
    await rpc('admin_create_time_slot', '02:00');
    assert.ok((await general()).includes('02:00'));
    assert.equal((await db.query("select count(*)::int n from public.time_slots where starts_at = '02:00'")).rows[0].n, 1);
  } finally { await db.close(); }
});

// ---- invariants: one canonical row per hour, package-level edits never touch shared rows, history is never deleted ---------------------------------

const slotState = async (db, time) => (await db.query("select id, active, is_general, to_char(starts_at,'HH24:MI') t from public.time_slots where starts_at = $1", [time])).rows;

test('ONE row per hour: a package using 13:30 and a later general 13:30 share the same row; being general never stops packages from using it', async () => {
  const { db, rpc, general } = await database();
  try {
    await db.exec("insert into public.tour_packages (id, departure_times) values ('own', array['13:30'])");
    const specificOnly = await slotState(db, '13:30');
    assert.equal(specificOnly.length, 1);
    assert.equal(specificOnly[0].is_general, false);
    await rpc('admin_create_time_slot', '13:30'); // becomes part of the inheritable catalog
    const shared = await slotState(db, '13:30');
    assert.deepEqual(shared.map((row) => [row.id, row.active, row.is_general]), [[specificOnly[0].id, true, true]], 'same row, now general');
    assert.ok((await general()).includes('13:30'));
    // A second package with its own list reuses that very row (no duplicate), and the first still works.
    await db.exec("insert into public.tour_packages (id, departure_times) values ('own2', array['13:30','07:00'])");
    assert.equal((await slotState(db, '13:30')).length, 1);
    await db.exec("update public.tour_packages set departure_times = array['07:00'] where id = 'own'");
    assert.deepEqual((await slotState(db, '13:30')).map((row) => [row.active, row.is_general]), [[true, true]], 'general hours are never released by a package');
  } finally { await db.close(); }
});

test('a package edits ITS OWN hour 13:30 -> 13:45: the shared row is never UPDATEd; it is released only when nobody needs it any more', async () => {
  const { db, general } = await database();
  try {
    await db.exec("insert into public.tour_packages (id, departure_times) values ('a', array['13:30']), ('b', array['13:30'])");
    const before = (await slotState(db, '13:30'))[0];
    await db.exec("update public.tour_packages set departure_times = array['13:45'] where id = 'a'"); // 13:30 -> 13:45 for package a only
    const after = (await slotState(db, '13:30'))[0];
    assert.deepEqual(after, before, 'package b still uses 13:30: the row is untouched (same id, hour, flags, still active)');
    assert.deepEqual((await db.query("select departure_times from public.tour_packages where id = 'b'")).rows[0].departure_times, ['13:30']);
    assert.deepEqual((await slotState(db, '13:45')).map((row) => [row.active, row.is_general]), [[true, false]], 'the new hour is registered for the package, not promoted');
    // Now the last package that referenced 13:30 moves too: the row is released (inactive), not deleted.
    await db.exec("update public.tour_packages set departure_times = array['13:45'] where id = 'b'");
    assert.deepEqual((await slotState(db, '13:30')).map((row) => [row.active, row.is_general]), [[false, false]]);
    assert.ok(!(await general()).includes('13:30') && !(await general()).includes('13:45'), 'the catalog never changed');
    // Deleting the packages releases their hours too.
    await db.exec("delete from public.tour_packages where id = 'a'");
    await db.exec("delete from public.tour_packages where id = 'b'");
    assert.deepEqual((await slotState(db, '13:45')).map((row) => row.active), [false]);
    // Using the hour again simply re-activates the same row.
    await db.exec("insert into public.tour_packages (id, departure_times) values ('c', array['13:45'])");
    assert.deepEqual((await slotState(db, '13:45')).map((row) => [row.active]), [[true]]);
    assert.equal((await slotState(db, '13:45')).length, 1);
  } finally { await db.close(); }
});

test('a slot with history is NEVER deleted: bookings keep working after the hour is released, edited or removed from the catalog', async () => {
  const { db, rpc } = await database();
  try {
    await db.exec("insert into public.tour_packages (id, departure_times) values ('own', array['13:30'])");
    const slot = (await slotState(db, '13:30'))[0];
    await db.exec(`insert into public.bookings (tour_package_id, time_slot_id, tour_date, boat_id) values ('own', '${slot.id}', '2099-01-01', 'b1')`);
    await db.exec("update public.tour_packages set departure_times = array['14:00'] where id = 'own'"); // releases 13:30
    await db.exec("delete from public.tour_packages where id = 'own'");
    await rpc('admin_create_time_slot', '09:15');
    await rpc('admin_delete_time_slot', 'departure-0915');
    const rows = await slotState(db, '13:30');
    assert.equal(rows.length, 1, 'the row still exists');
    assert.equal(rows[0].active, false);
    assert.equal((await db.query('select count(*)::int n from public.bookings where time_slot_id = $1', [slot.id])).rows[0].n, 1, 'and the booking still references it');
    assert.equal((await slotState(db, '09:15')).length, 1, 'RPC delete is a soft delete: the row remains');
    // No code path hard-deletes a time slot.
    const sources = migration('202610090002_time_slots_general_vs_package.sql');
    assert.doesNotMatch(sources.replace(/--.*$/gm, ''), /delete\s+from\s+public\.time_slots/i);
  } finally { await db.close(); }
});

test('one resolution rule: the booking validation (database) and get-booking-availability accept EXACTLY the same hours for every kind of package', async () => {
  const { db } = await database();
  try {
    // general: 02:00 06:00 07:00 11:30 15:30 18:30; package-specific 13:30; released (inactive, not general) 16:00; a listed hour whose row is gone.
    await db.exec("insert into public.tour_packages (id, departure_times) values ('registrar', array['13:30','16:00'])");
    await db.exec("update public.tour_packages set departure_times = array['13:30'] where id = 'registrar'"); // 16:00 released
    await db.exec("insert into public.tour_packages (id, departure_times) values ('inherit', null), ('none', '{}'), ('mixed', array['07:00','13:30','18:30']), ('missing', array['03:45'])");
    await db.exec("delete from public.time_slots where starts_at = '03:45'");
    const rows = (await db.query("select id, label, to_char(starts_at,'HH24:MI') || ':00' as starts_at, is_general from public.time_slots where active order by starts_at")).rows;
    const slotsByTime = Object.fromEntries((await db.query("select id, to_char(starts_at,'HH24:MI') t from public.time_slots")).rows.map((row) => [row.t, row.id]));
    const offeredByEdge = (departureTimes) => resolve(rows, departureTimes).map((slot) => slot.starts_at.slice(0, 5));
    for (const [pkg, list] of [['inherit', null], ['none', []], ['mixed', ['07:00', '13:30', '18:30']], ['registrar', ['13:30']], ['missing', ['03:45']]]) {
      const accepted = [];
      for (const [time, id] of Object.entries(slotsByTime)) {
        try { await db.query('insert into public.bookings (tour_package_id, time_slot_id, tour_date, boat_id) values ($1, $2, $3, $4)', [pkg, id, '2099-01-01', `b-${pkg}-${time}`]); accepted.push(time); } catch { /* rejected */ }
      }
      assert.deepEqual(accepted.sort(), offeredByEdge(list), `${pkg}: validation == availability`);
    }
    assert.deepEqual(offeredByEdge(null), ['02:00', '06:00', '07:00', '11:30', '15:30', '18:30'], 'inherit = active general hours only');
    assert.deepEqual(offeredByEdge([]), [], 'empty list = no departures');
    assert.deepEqual(offeredByEdge(['07:00', '13:30', '18:30']), ['07:00', '13:30', '18:30'], 'exactly the listed hours, no extra general ones');
    assert.deepEqual(offeredByEdge(['03:45']), [], 'a listed hour without an active row is not offered');
  } finally { await db.close(); }
});
