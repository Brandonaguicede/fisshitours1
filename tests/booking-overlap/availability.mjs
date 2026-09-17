import assert from 'node:assert/strict';
import { resolveAvailableDepartures } from '../../supabase/functions/_shared/boat-availability.mjs';

const slots = ['07:00','10:00','12:00','13:00','15:00'].map((time) => ({ id: time, label: time, starts_at: `${time}:00` }));
const result = resolveAvailableDepartures({
  slots,
  bookings: [{ time_slot_id: 'existing', tour_package_id: 'full' }],
  packages: [{ id: 'full', duration_minutes: 480 }],
  timeSlots: [{ id: 'existing', starts_at: '07:00:00' }],
  durationMinutes: 240,
  departureTimes: ['07:00','10:00','12:00','13:00','15:00'],
  blockedSlotIds: new Set(),
});
assert.deepEqual(result.map((slot) => slot.time), []);
assert.ok(result.every((slot) => slot.available));

const empty = resolveAvailableDepartures({
  slots, bookings: [], packages: [], timeSlots: [], durationMinutes: 240,
  departureTimes: ['08:00'], blockedSlotIds: new Set(),
});
assert.deepEqual(empty, []);
const lateSlots = ['15:30', '18:30'].map((time) => ({id: time, starts_at: time, label: time}));
const lateInput = {
  slots: lateSlots, bookings: [{time_slot_id: '15:30', tour_package_id: 'full'}],
  packages: [{id: 'full', duration_minutes: 480}], timeSlots: lateSlots,
  durationMinutes: 480, departureTimes: ['15:30', '18:30'], blockedSlotIds: new Set(),
};
assert.deepEqual(resolveAvailableDepartures(lateInput), []);
assert.deepEqual(resolveAvailableDepartures({...lateInput, bookings: []}).map(slot => slot.time), ['15:30', '18:30']);
const midnightSlots = ['15:30', '18:30'].map((time) => ({ id: time, starts_at: `${time}:00`, label: time }));
assert.deepEqual(resolveAvailableDepartures({
  slots: midnightSlots,
  bookings: [{ time_slot_id: '15:30', tour_package_id: 'full' }],
  packages: [{ id: 'full', duration_minutes: 480 }],
  timeSlots: [{ id: '15:30', starts_at: '15:30:00' }],
  durationMinutes: 480,
  departureTimes: ['15:30', '18:30'],
  blockedSlotIds: new Set(),
}), []);
const operatingSlots = ['07:00', '10:30', '11:30', '18:30'].map((time) => ({ id: time, starts_at: `${time}:00`, label: time }));
const operatingInput = {
  slots: operatingSlots,
  bookings: [],
  packages: [],
  timeSlots: [],
  durationMinutes: 480,
  departureTimes: ['07:00', '10:30', '11:30', '18:30'],
  blockedSlotIds: new Set(),
  operatingEnd: '18:30',
};
assert.deepEqual(resolveAvailableDepartures({ ...operatingInput, durationMinutes: 240 }).map((slot) => slot.time), ['07:00', '10:30', '11:30']);
assert.deepEqual(resolveAvailableDepartures({ ...operatingInput, durationMinutes: 360 }).map((slot) => slot.time), ['07:00', '10:30', '11:30']);
assert.deepEqual(resolveAvailableDepartures({ ...operatingInput, durationMinutes: 480 }).map((slot) => slot.time), ['07:00', '10:30']);
assert.deepEqual(resolveAvailableDepartures({ ...operatingInput, durationMinutes: 300 }).map((slot) => slot.time), ['07:00', '10:30', '11:30']);
assert.deepEqual(resolveAvailableDepartures({ ...operatingInput, operatingEnd: null }).map((slot) => slot.time), operatingSlots.map((slot) => slot.id));
console.log('PASS: availability returns only package-approved departures without interval conflicts.');
