import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const context = vm.createContext({});
const source = fs.readFileSync('src/services/catalogMappers.ts', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
const row = { id: 'package', name: 'Fishing package', base_price: 350, included_guests: 2, max_guests: 6, extra_guest_price: 0, boat_tours: { id: 'relation', boat_id: 'boat', tour_id: 'tour', boats: { max_guests: 6 }, tours: { id: 'tour', title: 'Fishing', category: 'Fishing' } } };
test('catalog preserves package durations including half hours and optional duration', () => {
  for (const [minutes, hours] of [[30, 0.5], [150, 2.5], [240, 4], [null, undefined]]) {
    assert.equal(context.mapBoatTour({ ...row, duration_minutes: minutes }, []).duration, hours);
  }
});
