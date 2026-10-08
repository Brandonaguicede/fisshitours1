import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'vite';

// The REAL public catalog mapper (src/services/catalogMappers.ts), bundled by Vite and run as-is: which hours does each kind of package offer?
const output = await build({ configFile: false, logLevel: 'error', build: { write: false, lib: { entry: 'src/services/catalogMappers.ts', formats: ['es'], fileName: 'mapper' } } });
const code = (Array.isArray(output) ? output[0] : output).output[0].code;
const { mapBoatTour } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const slot = (id, time, isGeneral) => ({ id, label: time, time, ...(isGeneral === undefined ? {} : { isGeneral }) });
const row = (departure_times) => ({
  id: 'pkg', boat_tour_id: 'bt', name: 'Half Day', package_type: 'half-day', active: true, sort_order: 1, base_price: 650, included_guests: 4, max_guests: 10, extra_guest_price: 50, custom_quote: false,
  departure_times, meal_options: [], package_included: null, duration_minutes: 240, description: null, image_url: null,
  boat_tours: { id: 'bt', boat_id: 'boat', tour_id: 'tour', active: true, boats: { active: true, max_guests: 10 }, tours: { id: 'tour', title: 'Fishing', category: 'Fishing', active: true, sort_order: 1, image_url: null, included: null, highlights: null, description: null } },
});
// The catalog arrives in no particular order (insertion / id / old sort_order): 13:30 is package-specific, 16:00 general.
const catalog = [slot('late', '16:30', true), slot('own', '13:30', false), slot('g1', '07:00', true), slot('early', '02:00', true), slot('g2', '11:30', true)];
const times = (departureTimes) => mapBoatTour(row(departureTimes), catalog).timeSlots.map((item) => item.time);

test('public catalog: a package that INHERITS offers only the general hours, chronologically (a hour registered for another package is not inherited)', () => {
  assert.deepEqual(times(null), ['02:00', '07:00', '11:30', '16:30']);
});

test('public catalog: a package with its OWN list offers exactly those hours — general or not — chronologically, never extra general ones', () => {
  assert.deepEqual(times(['16:30', '13:30', '07:00']), ['07:00', '13:30', '16:30']);
  assert.deepEqual(times(['13:30']), ['13:30']);
  assert.deepEqual(times([]), []);
  assert.deepEqual(times(['09:45']), [], 'a listed hour that has no row is not offered');
});

test('public catalog: edited / removed catalog hours are reflected (the mapper only reads the current catalog) and rows without the flag count as general', () => {
  const edited = [slot('g1', '07:45', true), slot('g2', '11:30', true)]; // 07:00 became 07:45
  assert.deepEqual(mapBoatTour(row(null), edited).timeSlots.map((item) => item.time), ['07:45', '11:30']);
  assert.deepEqual(mapBoatTour(row(null), [slot('a', '10:00'), slot('b', '08:00')]).timeSlots.map((item) => item.time), ['08:00', '10:00']);
  assert.deepEqual(mapBoatTour(row(null), []).timeSlots, []);
});
