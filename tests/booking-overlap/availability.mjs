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
assert.deepEqual(result.map((slot) => slot.time), ['15:00']);
assert.ok(result.every((slot) => slot.available));

const empty = resolveAvailableDepartures({
  slots, bookings: [], packages: [], timeSlots: [], durationMinutes: 240,
  departureTimes: ['08:00'], blockedSlotIds: new Set(),
});
assert.deepEqual(empty, []);
console.log('PASS: availability returns only package-approved departures without interval conflicts.');
