// Mapper + i18n for the three content levels of the public tour view: the tour's description and the package's own
// description are separate fields with NO fallback to each other (the legacy `description` keeps its package-then-tour
// fallback for the screens that already read it). Pure functions, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const context = vm.createContext({});
for (const file of ['src/utils/packageSettings.ts', 'src/services/catalogMappers.ts', 'src/i18n/content.ts']) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
}

const tourRow = (extra = {}) => ({ id: 'tour', title: 'Fishing', category: 'Fishing', description: 'Tour text', description_es: 'Texto del tour', highlights: ['Fishing'], highlights_es: ['Pesca'], ...extra });
const packageRow = (extra = {}, tour = tourRow()) => ({
  id: 'package', name: 'Half Day', base_price: 350, included_guests: 2, max_guests: 6, extra_guest_price: 0, duration_minutes: 240, description: null,
  boat_tours: { id: 'relation', boat_id: 'boat', tour_id: 'tour', active: true, boats: { active: true, max_guests: 6 }, tours: tour }, ...extra,
});
const map = (row) => context.mapBoatTour(row, [], [], []);

test('tour level reads only the tour; package level reads only the package', () => {
  const item = map(packageRow({ description: 'Package text', description_es: 'Texto del paquete' }));
  assert.equal(context.getTourLevelText(item, 'en').description, 'Tour text'); // no _en stored: original
  assert.equal(context.getTourLevelText(item, 'es').description, 'Texto del tour');
  assert.equal(context.getPackageOwnDescription(item, 'en'), 'Package text');
  assert.equal(context.getPackageOwnDescription(item, 'es'), 'Texto del paquete');
});

test('a package without its own description has none (no fallback to the tour), and a tour without one has none (no fallback to the package)', () => {
  const noOwn = map(packageRow());
  assert.equal(context.getPackageOwnDescription(noOwn, 'en'), '');
  assert.equal(context.getPackageOwnDescription(noOwn, 'es'), '');
  const noTourText = map(packageRow({ description: 'Package text' }, tourRow({ description: null, description_es: null })));
  assert.equal(context.getTourLevelText(noTourText, 'en').description, '');
  // the legacy field keeps its existing fallback for the screens that still read it
  assert.equal(noTourText.description, 'Package text');
});

test('tour activities are real activities only (no category substitute) and follow the language', () => {
  const item = map(packageRow());
  assert.deepEqual(Array.from(context.getTourLevelText(item, 'en').activities), ['Fishing']);
  assert.deepEqual(Array.from(context.getTourLevelText(item, 'es').activities), ['Pesca']);
  const none = map(packageRow({}, tourRow({ highlights: null, highlights_es: null })));
  assert.deepEqual(Array.from(context.getTourLevelText(none, 'en').activities), []);
});

test('a hand-written "Includes:" inside a description is left exactly as written (free text, never parsed)', () => {
  const text = 'Relaxed day. Includes: Drinks and snacks';
  const item = map(packageRow({}, tourRow({ description: text, description_es: null })));
  assert.equal(context.getTourLevelText(item, 'en').description, text);
  assert.equal(context.getTourLevelText(item, 'es').description, text);
});
