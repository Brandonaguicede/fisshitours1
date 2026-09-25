// ADMIN -> LANDING: what the public site shows in each language for every translatable field, computed with the
// real mapper (services/catalogMappers) and language selectors (i18n/content) on rows shaped EXACTLY like the
// Admin saves them (legacy column + `_en` = English written by the admin + `_es` = DeepL Spanish).
// Pure functions, no network. (Hero/About, Galería and Reseñas are covered by the landing test below / their own flow.)
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

// A tour as the Admin wizard saves it (create + Siguiente + Guardar): English in legacy and _en, Spanish in _es.
const tour = {
  id: 'tour', category: 'Fishing', image_url: null, active: true, sort_order: 1,
  title: 'Sunset Cruise', title_en: 'Sunset Cruise', title_es: 'Crucero al atardecer',
  description: 'Private cruise at sunset.', description_en: 'Private cruise at sunset.', description_es: 'Crucero privado al atardecer.',
  long_description: 'Long English text.', long_description_en: 'Long English text.', long_description_es: 'Texto largo en español.',
  highlights: ['Sport fishing'], highlights_en: ['Sport fishing'], highlights_es: ['Pesca deportiva'],
  included: ['Drinks'], included_en: ['Drinks'], included_es: ['Bebidas'],
};
const packageRow = (extra = {}) => ({
  id: 'package', name: 'Half Day', name_en: 'Half Day', name_es: 'Medio día', description: null, description_en: null, description_es: null,
  base_price: 350, included_guests: 2, max_guests: 6, extra_guest_price: 0, duration_minutes: 240,
  package_type: 'half-day', departure_times: null, custom_quote: false, active: true, sort_order: 1,
  meal_options: [{ es: 'Casado con pescado', en: 'Fish casado' }], package_included: null, package_included_en: null, package_included_es: null,
  boat_tours: { id: 'relation', boat_id: 'boat', tour_id: 'tour', active: true, boats: { active: true, max_guests: 6 }, tours: tour },
  ...extra,
});
const inclusions = [{ id: 'i1', tour_id: 'tour', tour_package_id: null, active: true, sort_order: 1, label: 'Ice', label_en: 'Ice', label_es: 'Hielo' }];
const images = [{ id: 'img', tour_id: 'tour', image_url: '/a.jpg', alt_text: 'Sunset Cruise photo 1', alt_text_en: null, alt_text_es: null, active: true, sort_order: 1 }];
const mapped = (row) => context.mapBoatTour(row, [], images, inclusions);

test('TOUR title, phrase, description and activities: EN shows what the admin wrote, ES shows the DeepL translation', () => {
  const t = mapped(packageRow());
  const en = context.getTourText(t, 'en');
  const es = context.getTourText(t, 'es');
  assert.equal(en.title, 'Sunset Cruise');
  assert.equal(es.title, 'Crucero al atardecer');
  assert.equal(en.shortDescription, 'Private cruise at sunset.');
  assert.equal(es.shortDescription, 'Crucero privado al atardecer.');
  assert.deepEqual(en.activities, ['Sport fishing']);
  assert.deepEqual(es.activities, ['Pesca deportiva']);
});

test('TOUR "Incluye" through the tour inclusions: EN / ES each show their own language', () => {
  const t = mapped(packageRow());
  assert.deepEqual(context.getTourText(t, 'en').included, ['Ice']);
  assert.deepEqual(context.getTourText(t, 'es').included, ['Hielo']);
});

test('PACKAGE name: EN shows the English name, ES the translated one; legacy packages keep the old fixed translations', () => {
  const t = mapped(packageRow());
  assert.equal(context.getPackageLabel(t, 'en'), 'Half Day');
  assert.equal(context.getPackageLabel(t, 'es'), 'Medio día');
  const custom = mapped(packageRow({ name: 'Sunset Special', name_en: 'Sunset Special', name_es: 'Especial de atardecer' }));
  assert.equal(context.getPackageLabel(custom, 'en'), 'Sunset Special');
  assert.equal(context.getPackageLabel(custom, 'es'), 'Especial de atardecer');
  // Legacy record without name_es/name_en: same behaviour as before (fixed replacements for Spanish).
  const legacy = mapped(packageRow({ name: 'Fishing Tour - Half Day', name_en: null, name_es: null }));
  assert.equal(context.getPackageLabel(legacy, 'en'), 'Half Day');
  assert.equal(context.getPackageLabel(legacy, 'es'), 'Medio dia');
});

test('PACKAGE description: its own EN/ES pair wins; an empty package description falls back to the tour\'s per language', () => {
  const own = mapped(packageRow({ description: 'Private sunset cruise.', description_en: 'Private sunset cruise.', description_es: 'Paseo privado al atardecer.' }));
  assert.equal(context.getTourText(own, 'en').description, 'Private sunset cruise.');
  assert.equal(context.getTourText(own, 'es').description, 'Paseo privado al atardecer.');
  const inherited = mapped(packageRow());
  assert.equal(context.getTourText(inherited, 'en').description, 'Private cruise at sunset.');
  assert.equal(context.getTourText(inherited, 'es').description, 'Crucero privado al atardecer.');
});

test('MEALS: each language reads its own side of meal_options ({ en: written by the admin, es: DeepL })', () => {
  const t = mapped(packageRow());
  assert.deepEqual(JSON.parse(JSON.stringify(t.mealOptions)), [{ es: 'Casado con pescado', en: 'Fish casado' }]);
  // TourDetailModal renders meal[language]
  assert.equal(t.mealOptions[0].en, 'Fish casado');
  assert.equal(t.mealOptions[0].es, 'Casado con pescado');
});

test('TOUR PHOTO alt: with no alt_text_es/en the ES alt is title_es and the EN alt is title_en (what the Admin leaves)', () => {
  const t = mapped(packageRow());
  const [photo] = t.galleryImages;
  assert.equal(context.pick('en', photo.altEs, photo.alt, photo.altEn), 'Sunset Cruise');
  assert.equal(context.pick('es', photo.altEs, photo.alt, photo.altEn), 'Crucero al atardecer');
});

test('BOAT badge and equipment: EN shows the English, ES the DeepL translation; the boat name is the same in both', () => {
  const boatRow = { id: 'boat', slug: 'boat', name: 'Second Wind', image_url: null, images: [], badge: 'Luxury meets nature', badge_en: 'Luxury meets nature', badge_es: 'Lujo y naturaleza', length: '32 ft', engine: 'Yamaha', max_guests: 10, featured_spec: null };
  const equipment = [
    { id: 'e1', boat_id: 'boat', label: 'Garmin GPS', label_en: 'Garmin GPS', label_es: 'GPS Garmin', sort_order: 1, active: true },
    { id: 'e2', boat_id: 'boat', label: 'Cooler', label_en: 'Cooler', label_es: 'Nevera', sort_order: 2, active: true },
  ];
  const boat = context.mapBoat(boatRow, equipment);
  const en = context.getBoatText(boat, 'en');
  const es = context.getBoatText(boat, 'es');
  assert.equal(en.badge, 'Luxury meets nature');
  assert.equal(es.badge, 'Lujo y naturaleza');
  assert.equal(en.featuredSpec, 'Garmin GPS, Cooler');
  assert.equal(es.featuredSpec, 'GPS Garmin, Nevera');
  assert.equal(boat.name, 'Second Wind');
});

test('FALLBACKS: a missing Spanish copy falls back to the English/legacy text, never to an empty value or the other tour', () => {
  const partial = mapped(packageRow());
  const noEs = { ...partial, tourTitleEs: undefined, descriptionEs: undefined, shortDescriptionEs: undefined, activitiesEs: [] };
  const es = context.getTourText(noEs, 'es');
  assert.equal(es.title, 'Sunset Cruise');
  assert.equal(es.shortDescription, 'Private cruise at sunset.');
  assert.deepEqual(es.activities, ['Sport fishing']);
  // English visitors with no English copy see the legacy text (older records), then the Spanish as a last resort.
  const noEn = { ...partial, tourTitleEn: undefined, tourTitle: '' };
  assert.equal(context.getTourText(noEn, 'en').title, 'Crucero al atardecer');
});
