// What the PUBLIC site shows for a package's "Incluye": catalogMappers.mapBoatTour (data -> BoatTour) and
// i18n/content.getTourText (BoatTour -> the language the visitor reads). Pure functions, no network.
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

const tourRow = { id: 'tour', title: 'Fishing', category: 'Fishing', included: ['Tour legacy'], included_es: ['Del tour ES'], included_en: ['Tour list EN'] };
const packageRow = (extra = {}) => ({
  id: 'package', name: 'Half Day', base_price: 350, included_guests: 2, max_guests: 6, extra_guest_price: 0, duration_minutes: 240,
  package_included: null, package_included_es: null, package_included_en: null,
  boat_tours: { id: 'relation', boat_id: 'boat', tour_id: 'tour', active: true, boats: { active: true, max_guests: 6 }, tours: tourRow },
  ...extra,
});
const tourInclusions = [
  { id: 'i1', tour_id: 'tour', tour_package_id: null, active: true, sort_order: 1, label: 'Inclusión', label_es: 'Inclusión ES', label_en: 'Inclusion EN' },
];
const shown = (row, language, inclusions = []) => context.getTourText(context.mapBoatTour(row, [], [], inclusions), language).included;

test('a package edited in the Admin (English written + Spanish generated) shows the updated list in each language', () => {
  const row = packageRow({ package_included: ['Drinks', 'Towel'], package_included_en: ['Drinks', 'Towel'], package_included_es: ['Bebidas', 'Toalla'] });
  assert.deepEqual(shown(row, 'es'), ['Bebidas', 'Toalla']);
  assert.deepEqual(shown(row, 'en'), ['Drinks', 'Towel']);
});

test('a package with its own list never shows the tour\'s inclusions or lists, even while a translation is missing', () => {
  // Only package_included saved (record predating the automatic translation): both languages fall back to it,
  // not to tour_inclusions / tours.included_es / included_en.
  const legacy = packageRow({ package_included: ['Drinks', 'Snacks'] });
  assert.deepEqual(shown(legacy, 'es', tourInclusions), ['Drinks', 'Snacks']);
  assert.deepEqual(shown(legacy, 'en', tourInclusions), ['Drinks', 'Snacks']);
  // Only one side filled: the missing one falls back to package_included, the filled one is used.
  const onlyEn = packageRow({ package_included: ['Drinks'], package_included_en: ['Drinks'] });
  assert.deepEqual(shown(onlyEn, 'es', tourInclusions), ['Drinks']);
  assert.deepEqual(shown(onlyEn, 'en', tourInclusions), ['Drinks']);
  const onlyEs = packageRow({ package_included: ['Drinks'], package_included_es: ['Bebidas'] });
  assert.deepEqual(shown(onlyEs, 'es', tourInclusions), ['Bebidas']);
  assert.deepEqual(shown(onlyEs, 'en', tourInclusions), ['Drinks']);
});

test('an explicitly empty package list stays empty in both languages', () => {
  const row = packageRow({ package_included: [], package_included_es: [], package_included_en: [] });
  assert.deepEqual(shown(row, 'es', tourInclusions), []);
  assert.deepEqual(shown(row, 'en', tourInclusions), []);
});

test('a package that inherits (package_included null) uses the tour\'s lists per language and ignores stale package copies', () => {
  const inherit = packageRow();
  assert.deepEqual(shown(inherit, 'es', tourInclusions), ['Inclusión ES']);
  assert.deepEqual(shown(inherit, 'en', tourInclusions), ['Inclusion EN']);
  assert.deepEqual(shown(inherit, 'es'), ['Del tour ES']);
  assert.deepEqual(shown(inherit, 'en'), ['Tour list EN']);
  const stale = packageRow({ package_included_es: ['Vieja ES'], package_included_en: ['Old EN'] });
  assert.deepEqual(shown(stale, 'es', tourInclusions), ['Inclusión ES']);
  assert.deepEqual(shown(stale, 'en', tourInclusions), ['Inclusion EN']);
});
