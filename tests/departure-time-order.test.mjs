// Departure times are shown in chronological order (presentation only): timeToMinutes + sortSlotsChronologically in utils/format.
// Pure functions, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const context = vm.createContext({});
vm.runInContext(ts.transpile(fs.readFileSync('src/utils/format.ts', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
const order = (times) => Array.from(context.sortSlotsChronologically(times.map((time, index) => ({ time, index })))).map((slot) => slot.time);

test('timeToMinutes reads stored 24h times and 12h AM/PM labels to the same minute', () => {
  const minutes = (value) => context.timeToMinutes(value);
  assert.equal(minutes('06:00'), 360); assert.equal(minutes('6:00 AM'), 360);
  assert.equal(minutes('11:30'), 690); assert.equal(minutes('11:30 AM'), 690);
  assert.equal(minutes('12:00'), 720); assert.equal(minutes('12:00 PM'), 720);
  assert.equal(minutes('00:00'), 0); assert.equal(minutes('12:00 AM'), 0);
  assert.equal(minutes('14:00'), 840); assert.equal(minutes('2:00 PM'), 840);
  assert.equal(minutes('07:05:30'), 425);
  assert.equal(minutes('soon'), null); assert.equal(minutes('25:00'), null); assert.equal(minutes('13:00 PM'), null);
});

test('sorted by time of day, not alphabetically: 9:00 before 10:00, AM before PM, 11:30 AM < 12:00 PM < 2:00 PM', () => {
  assert.deepEqual(order(['10:00', '9:00', '07:00']), ['07:00', '9:00', '10:00']); // a string sort would put 10:00 first
  assert.deepEqual(order(['14:00', '12:00', '11:30', '06:00', '08:00', '07:00']), ['06:00', '07:00', '08:00', '11:30', '12:00', '14:00']);
  assert.deepEqual(order(['2:00 PM', '12:00 PM', '11:30 AM', '6:00 AM', '12:00 AM']), ['12:00 AM', '6:00 AM', '11:30 AM', '12:00 PM', '2:00 PM']);
});

test('the sort never mutates the stored order, is stable for equal times and keeps non-times last', () => {
  const stored = [{ time: '08:00', id: 'a' }, { time: '07:00', id: 'b' }, { time: 'tbd', id: 'c' }, { time: '07:00', id: 'd' }];
  const snapshot = JSON.stringify(stored);
  const sorted = Array.from(context.sortSlotsChronologically(stored));
  assert.equal(JSON.stringify(stored), snapshot, 'input untouched');
  assert.deepEqual(sorted.map((slot) => slot.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(Array.from(context.sortSlotsChronologically([])), []);
});
