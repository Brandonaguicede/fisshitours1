// Package completeness: what a tour package needs to be bookable (utils/packageRequirements.ts), how the public catalog filters on it
// (utils/tourCatalog.ts) and how the Admin service layer refuses to save / activate an incomplete package. Pure logic, no browser: the
// TypeScript modules are loaded as they ship (tests/support/load-ts.mjs) and the Supabase client is an in-memory fake.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { loadTs, plain } from './support/load-ts.mjs';

function loadRequirements() {
  const context = vm.createContext({ Number, Array, Error, Object, String, Math, JSON, Promise });
  loadTs('src/utils/packageRequirements.ts', context);
  return context;
}

const complete = { name: 'Half Day', customQuote: false, basePrice: 650, includedGuests: 4, maxGuests: 10, extraGuestPrice: 50, durationMinutes: 240, departureTimes: ['07:00', '11:30'], sharedTimeCount: 4 };
const issuesOf = (context, changes) => plain(vm.runInContext('findPackageIssues', context)({ ...complete, ...changes }));

test('a complete package is ready: no issues, isPackageReady is true', () => {
  const context = loadRequirements();
  assert.deepEqual(issuesOf(context, {}), []);
  assert.equal(vm.runInContext('isPackageReady', context)(complete), true);
});

test('duration: missing, zero, negative or fractional minutes are invalid; any positive whole number is fine', () => {
  const context = loadRequirements();
  for (const durationMinutes of [null, undefined, 0, -30, 90.5, Number.NaN]) assert.deepEqual(issuesOf(context, { durationMinutes }), ['duration'], String(durationMinutes));
  for (const durationMinutes of [1, 60, 240, 720]) assert.deepEqual(issuesOf(context, { durationMinutes }), [], String(durationMinutes));
});

test('schedule: an own list needs at least one valid HH:MM; inheriting the shared schedule needs at least one active shared time', () => {
  const context = loadRequirements();
  assert.deepEqual(issuesOf(context, { departureTimes: [] }), ['schedule']);
  assert.deepEqual(issuesOf(context, { departureTimes: ['7am'] }), ['schedule']);
  assert.deepEqual(issuesOf(context, { departureTimes: null, sharedTimeCount: 0 }), ['schedule']);
  assert.deepEqual(issuesOf(context, { departureTimes: null, sharedTimeCount: 3 }), []);
  assert.deepEqual(issuesOf(context, { departureTimes: ['08:00'] }), []);
});

test('capacity: max guests must be a positive number and never lower than the included guests; included guests at least 1', () => {
  const context = loadRequirements();
  assert.deepEqual(issuesOf(context, { maxGuests: 0 }), ['maxGuests']);
  assert.deepEqual(issuesOf(context, { maxGuests: null }), ['maxGuests']);
  assert.deepEqual(issuesOf(context, { includedGuests: 6, maxGuests: 4 }), ['maxGuests']);
  assert.deepEqual(issuesOf(context, { includedGuests: 4, maxGuests: 4 }), []);
  assert.deepEqual(issuesOf(context, { includedGuests: 0 }), ['includedGuests']);
});

test('price: it must be a number above 0 (0 is not sellable); the extra guest price may be 0 but never negative', () => {
  const context = loadRequirements();
  for (const basePrice of [0, -5, null, Number.NaN]) assert.deepEqual(issuesOf(context, { basePrice }), ['price'], String(basePrice));
  assert.deepEqual(issuesOf(context, { extraGuestPrice: 0 }), []);
  assert.deepEqual(issuesOf(context, { extraGuestPrice: -1 }), ['extraGuestPrice']);
});

test('optional things are optional: nothing else is required (description, meals, inclusions are not part of the contract)', () => {
  const context = loadRequirements();
  // The facts carry no description / meals / inclusions at all, and the package is still ready.
  assert.deepEqual(issuesOf(context, {}), []);
});

test('a custom-quote package is not bookable online, so duration / schedule / price do not apply (name and capacity still do)', () => {
  const context = loadRequirements();
  const quote = { customQuote: true, durationMinutes: null, departureTimes: [], basePrice: 0, includedGuests: 0 };
  assert.deepEqual(issuesOf(context, quote), []);
  assert.deepEqual(issuesOf(context, { ...quote, name: ' ' }), ['name']);
});

test('several problems are all reported, with admin wording that never shows a column name', () => {
  const context = loadRequirements();
  const issues = issuesOf(context, { durationMinutes: null, departureTimes: [] });
  assert.deepEqual(issues, ['duration', 'schedule']);
  const text = vm.runInContext('describePackageIssues', context)(issues);
  assert.equal(text, 'la duración, al menos un horario de salida');
  assert.doesNotMatch(text, /_|duration_minutes|departure_times/);
});

// ---- public catalog ------------------------------------------------------------------------------------------------------------

function loadCatalog() {
  const context = loadRequirements();
  loadTs('src/utils/tourCatalog.ts', context);
  return context;
}
const boatTour = (changes = {}) => ({
  id: 'p1', boatId: 'boat-1', boatTourId: 'link-1', tourId: 'tour-1', name: 'Half Day', category: 'Fishing', description: '', catalogActive: true, customQuote: false,
  basePrice: 650, includedGuests: 4, maxGuests: 10, extraGuestPrice: 50, duration: 4, image: '', timeSlots: [{ id: 's1', label: 'Morning', time: '07:00' }], ...changes,
});

test('public catalog: a complete package is offered; one without duration (or with a 0 duration) or without departures is NOT', () => {
  const context = loadCatalog();
  const bookable = vm.runInContext('isBookableCatalogPackage', context);
  assert.equal(bookable(boatTour()), true);
  assert.equal(bookable(boatTour({ duration: undefined })), false, 'no duration');
  assert.equal(bookable(boatTour({ duration: 0 })), false, 'duration 0');
  assert.equal(bookable(boatTour({ timeSlots: [] })), false, 'no departures');
  assert.equal(bookable(boatTour({ basePrice: Number.NaN })), false, 'no price');
  assert.equal(bookable(boatTour({ includedGuests: 6, maxGuests: 4 })), false, 'max below included');
  assert.equal(bookable(boatTour({ customQuote: true })), false, 'custom quote is never bookable online');
  assert.equal(bookable(boatTour({ catalogActive: false })), false, 'inactive');
});

test('public catalog: grouping drops the incomplete package but keeps the complete ones of the same tour', () => {
  const context = loadCatalog();
  const group = vm.runInContext('groupTourCatalog', context);
  const boats = [{ id: 'boat-1', name: 'Second Wind' }];
  const groups = plain(group([boatTour({ id: 'good' }), boatTour({ id: 'bad', duration: undefined, basePrice: 800 })], boats));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].boatOptions[0].packages.map((item) => item.id), ['good']);
  assert.equal(groups[0].fromPrice, 650, 'the incomplete package no longer drives "from" prices');
  assert.deepEqual(plain(group([boatTour({ id: 'bad', duration: undefined })], boats)), [], 'a tour whose only package is incomplete is not offered');
});

// ---- Admin service layer -------------------------------------------------------------------------------------------------------

function fakeSupabase({ sharedSlots = 3, rows = [] } = {}) {
  const writes = [];
  const from = (table) => {
    const state = { op: 'select', payload: null, filters: [] };
    const run = (single) => {
      if (state.op !== 'select') { writes.push({ table, op: state.op, payload: state.payload, filters: state.filters }); return { data: null, error: null }; }
      if (table === 'time_slots') return { data: null, error: null, count: sharedSlots };
      if (table === 'boat_tours') return { data: { id: 'link-1' }, error: null };
      if (table === 'tour_packages') {
        let list = rows;
        for (const [kind, column, value] of state.filters) list = list.filter((row) => (kind === 'in' ? value.includes(row[column]) : row[column] === value));
        return single ? { data: list[0] ?? null, error: null } : { data: list, error: null };
      }
      return { data: null, error: null };
    };
    const api = {
      select() { return api; },
      eq(column, value) { state.filters.push(['eq', column, value]); return api; },
      in(column, value) { state.filters.push(['in', column, value]); return api; },
      order() { return api; },
      upsert(payload) { state.op = 'upsert'; state.payload = payload; return api; },
      update(payload) { state.op = 'update'; state.payload = payload; return api; },
      insert(payload) { state.op = 'insert'; state.payload = payload; return api; },
      delete() { state.op = 'delete'; return api; },
      single: () => Promise.resolve(run(true)),
      maybeSingle: () => Promise.resolve(run(true)),
      then: (resolve, reject) => Promise.resolve(run(false)).then(resolve, reject),
    };
    return api;
  };
  return { supabase: { from }, writes };
}

function loadService(options) {
  const { supabase, writes } = fakeSupabase(options);
  const context = vm.createContext({ Number, Array, Error, Object, String, Math, JSON, Promise, Date, supabase });
  loadTs('src/utils/packageRequirements.ts', context);
  loadTs('src/services/adminBoatToursService.ts', context);
  return { context, writes, call: (name, ...args) => vm.runInContext(name, context)(...args) };
}
const input = (changes = {}) => ({ id: 'p1', name: 'Half Day', packageType: 'half-day', durationMinutes: 240, basePrice: 650, includedGuests: 4, maxGuests: 10, extraGuestPrice: 50, description: null, departureTimes: ['07:00'], mealOptions: [], packageIncluded: null, customQuote: false, active: true, sortOrder: 1, ...changes });
const dbRow = (changes = {}) => ({ id: 'p1', boat_tour_id: 'link-1', name: 'Half Day', custom_quote: false, base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, duration_minutes: 240, departure_times: ['07:00'], active: false, ...changes });
const rejection = (promise) => promise.then(() => null, (error) => error);

test('service: saving an ACTIVE package without duration is rejected with a controlled error and nothing is written', async () => {
  const { call, writes } = loadService();
  const error = await rejection(call('savePackageForBoatTour', 'boat-1', 'tour-1', input({ durationMinutes: null }), 10));
  assert.equal(error?.name, 'PackageIncompleteError');
  assert.deepEqual(plain(error.issues), ['duration']);
  assert.match(error.message, /Falta: la duración/);
  assert.deepEqual(writes, []);
});

test('service: no departure time (own empty list, or inheriting a shared schedule that is empty) is rejected when active', async () => {
  const own = loadService();
  assert.deepEqual(plain((await rejection(own.call('savePackageForBoatTour', 'boat-1', 'tour-1', input({ departureTimes: [] }), 10))).issues), ['schedule']);
  const inherited = loadService({ sharedSlots: 0 });
  assert.deepEqual(plain((await rejection(inherited.call('savePackageForBoatTour', 'boat-1', 'tour-1', input({ departureTimes: null }), 10))).issues), ['schedule']);
  assert.deepEqual(own.writes, []);
  assert.deepEqual(inherited.writes, []);
});

test('service: max guests below the included guests is lifted to the included guests (existing rule); a missing capacity is rejected', async () => {
  const { call, writes } = loadService();
  const error = await rejection(call('savePackageForBoatTour', 'boat-1', 'tour-1', input({ includedGuests: 6, maxGuests: 4 }), 10));
  // The service keeps its existing clamp (max >= included, so the DB CHECK can never fail); the form reports the mistake to the admin first.
  assert.equal(error, null);
  assert.equal(writes.length, 1);
  const invalid = await rejection(call('savePackageForBoatTour', 'boat-1', 'tour-1', input({ maxGuests: 0, includedGuests: 0 }), 0));
  assert.equal(invalid?.name, 'PackageIncompleteError');
});

test('service: an incomplete package CAN be saved while it stays inactive, and a complete one saves with its duration', async () => {
  const draft = loadService();
  await draft.call('savePackageForBoatTour', 'boat-1', 'tour-1', input({ durationMinutes: null, departureTimes: [], active: false }), 10);
  assert.equal(draft.writes.length, 1);
  assert.equal(draft.writes[0].payload.active, false);
  assert.equal(draft.writes[0].payload.duration_minutes, null);

  const good = loadService();
  await good.call('savePackageForBoatTour', 'boat-1', 'tour-1', input(), 10);
  assert.equal(good.writes.length, 1);
  assert.deepEqual([good.writes[0].payload.active, good.writes[0].payload.duration_minutes, good.writes[0].payload.departure_times], [true, 240, ['07:00']]);
});

test('service: setPackageActive(true) refuses an incomplete stored package and activates a complete one; hiding is always allowed', async () => {
  const bad = loadService({ rows: [dbRow({ duration_minutes: null })] });
  const error = await rejection(bad.call('setPackageActive', 'p1', true));
  assert.equal(error?.name, 'PackageIncompleteError');
  assert.deepEqual(bad.writes, []);

  const good = loadService({ rows: [dbRow()] });
  await good.call('setPackageActive', 'p1', true);
  assert.deepEqual(good.writes.map((write) => [write.op, write.payload.active]), [['update', true]]);

  const hide = loadService({ rows: [dbRow({ duration_minutes: null, active: true })] });
  await hide.call('setPackageActive', 'p1', false);
  assert.deepEqual(hide.writes.map((write) => [write.op, write.payload.active]), [['update', false]]);
});

test('service: adding a tour back to a boat only re-activates the packages that can be booked and reports the incomplete ones', async () => {
  const { call, writes } = loadService({ rows: [dbRow({ id: 'ok' }), dbRow({ id: 'no-duration', name: 'Full Day', duration_minutes: null }), dbRow({ id: 'no-times', name: '3/4 Day', departure_times: [] })] });
  const result = plain(await call('enableTourForBoat', 'boat-1', 'tour-1', 1));
  assert.deepEqual(result.skipped.map((item) => item.id), ['no-duration', 'no-times']);
  const packageUpdates = writes.filter((write) => write.table === 'tour_packages');
  assert.equal(packageUpdates.length, 1);
  assert.deepEqual(plain(packageUpdates[0].filters), [['in', 'id', ['ok']]]);
  assert.equal(packageUpdates[0].payload.active, true);
});
