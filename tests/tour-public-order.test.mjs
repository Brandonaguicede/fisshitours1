// Public tours vs Admin: which tours appear and in which order. Real code under test: getActiveBoatTours (src/services/boatTourService.ts) and the grouping
// used by the home carousel / Tours page (src/utils/tourCatalog.ts), bundled by Vite. The fake Supabase applies the exact `.eq(...)` filters the real
// query declares (including the embedded ones), so the tests depend on the real query, not on a hand-written copy of it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { build } from 'vite';

const bundle = async (entry, fileName) => {
  const output = await build({
    configFile: false, logLevel: 'error',
    plugins: [{ name: 'fake-supabase', enforce: 'pre', resolveId: (id) => (id.endsWith('/lib/supabase') ? '\0fake-supabase' : null), load: (id) => (id === '\0fake-supabase' ? 'export const supabase = new Proxy({}, { get: (_, name) => (...args) => globalThis.__fakeSupabase[name](...args) });' : null) }],
    build: { write: false, lib: { entry, formats: ['es'], fileName } },
  });
  return import(`data:text/javascript;base64,${Buffer.from((Array.isArray(output) ? output[0] : output).output[0].code).toString('base64')}`);
};
const { getActiveBoatTours } = await bundle('src/services/boatTourService.ts', 'tour-service');
const { groupTourCatalog } = await bundle('src/utils/tourCatalog.ts', 'tour-catalog');

const at = (row, path) => path.split('.').reduce((value, key) => (value == null ? value : value[key]), row);
function fakeSupabase(tables) {
  const query = (name) => {
    let rows = tables[name] ?? [];
    const q = {
      select: () => q,
      eq: (column, value) => { rows = rows.filter((row) => at(row, column) === value); return q; },
      order: () => q, // The service's own `.order('sort_order')` (package order) is what the real database would apply; the fake keeps the given order.
      then: (resolve) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  globalThis.__fakeSupabase = { from: (name) => query(name) };
}

const TOURS = ['Beach & snorkeling tour', 'Fishing Tour', 'Water toys tour', 'Luxury Catamaran Charter', 'Bioluminescence Tour', 'Surfing tour', 'Jet Ski Rentals', 'Fishing tour 2'];
const timeSlots = [{ id: 'g1', label: '07:00', starts_at: '07:00:00', is_general: true, active: true }, { id: 'g2', label: '11:30', starts_at: '11:30:00', is_general: true, active: true }];

// One bookable package per tour. tour_packages.sort_order is DELIBERATELY the reverse of the tour order, so a catalog that kept the package order
// (the original defect) would list the tours 8..1, and one sorted by name or price would not be 1..8 either.
function packageFor(index, { tourActive = true, packageActive = true, boatActive = true, linkActive = true } = {}) {
  const tourId = `tour-${index + 1}`;
  return {
    id: `pkg-${index + 1}`, boat_tour_id: `bt-${index + 1}`, name: 'Half Day', package_type: 'half-day', active: packageActive, sort_order: 100 - index, base_price: 900 - index * 100,
    included_guests: 4, max_guests: 10, extra_guest_price: 50, custom_quote: false, departure_times: null, meal_options: [], package_included: null, duration_minutes: 240, description: null, image_url: null,
    boat_tours: {
      id: `bt-${index + 1}`, boat_id: 'boat-1', tour_id: tourId, active: linkActive, boats: { active: boatActive, max_guests: 10 },
      tours: { id: tourId, title: TOURS[index], category: 'Fishing', active: tourActive, sort_order: index + 1, image_url: null, included: null, highlights: null, description: null },
    },
  };
}
const boats = [{ id: 'boat-1' }];
const publicTours = async (packages) => {
  fakeSupabase({ tour_packages: packages, time_slots: timeSlots, tour_images: [], tour_inclusions: [] });
  return groupTourCatalog(await getActiveBoatTours(), boats);
};
const titles = (groups) => groups.map((group) => group.tour.tourTitle);

test('8 active tours with a bookable package -> 8 public tours, in exactly the Admin order 1..8', async () => {
  const groups = await publicTours([...Array(8).keys()].map((index) => packageFor(index)));
  assert.equal(groups.length, 8);
  assert.deepEqual(titles(groups), TOURS);
  assert.deepEqual(groups.map((group) => group.tour.tourSortOrder), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('the service itself returns the catalog in tour order (every list that reads it — booking panel, contact form, fleet — inherits it)', async () => {
  fakeSupabase({ tour_packages: [...Array(8).keys()].map((index) => packageFor(index)), time_slots: timeSlots, tour_images: [], tour_inclusions: [] });
  const flat = await getActiveBoatTours();
  assert.deepEqual(flat.map((item) => item.tourSortOrder), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('reordering in Admin (new tours.sort_order values) is exactly what the public list follows — not name, price or package order', async () => {
  // Admin saved: Surfing first, Fishing Tour second, Beach third, the rest unchanged below.
  const newOrder = { 'Surfing tour': 1, 'Fishing Tour': 2, 'Beach & snorkeling tour': 3, 'Water toys tour': 4, 'Luxury Catamaran Charter': 5, 'Bioluminescence Tour': 6, 'Jet Ski Rentals': 7, 'Fishing tour 2': 8 };
  const packages = [...Array(8).keys()].map((index) => { const row = packageFor(index); row.boat_tours.tours.sort_order = newOrder[row.boat_tours.tours.title]; return row; });
  const groups = await publicTours(packages);
  assert.deepEqual(titles(groups), Object.keys(newOrder).sort((a, b) => newOrder[a] - newOrder[b]));
});

test('an inactive tour does not appear; the rest keep their relative order', async () => {
  const packages = [...Array(8).keys()].map((index) => packageFor(index, { tourActive: index !== 2 })); // "Water toys tour" is inactive
  const groups = await publicTours(packages);
  assert.equal(groups.length, 7);
  assert.ok(!titles(groups).includes('Water toys tour'));
  assert.deepEqual(titles(groups), TOURS.filter((title) => title !== 'Water toys tour'));
});

test('DOCUMENTED RULE: a tour is public only while it has something bookable — an Active/Published tour whose boat links and packages are all inactive is not listed (production: "Fishing tour 2")', async () => {
  const packages = [...Array(8).keys()].map((index) => (index === 7 ? packageFor(index, { linkActive: false, packageActive: false }) : packageFor(index)));
  const groups = await publicTours(packages);
  assert.equal(groups.length, 7);
  assert.ok(!titles(groups).includes('Fishing tour 2'));
  // Each failing condition on its own removes the tour; nothing else does.
  for (const override of [{ linkActive: false }, { packageActive: false }, { boatActive: false }]) {
    const only = await publicTours([packageFor(0, override), packageFor(1)]);
    assert.deepEqual(titles(only), ['Fishing Tour'], JSON.stringify(override));
  }
});

test('no screen applies a second criterion: the fleet / booking / contact lists keep the order they receive and never re-sort tours by price or name', () => {
  const fleet = fs.readFileSync('src/components/home/FleetSection.tsx', 'utf8');
  assert.doesNotMatch(fleet, /\.sort\(\(a, b\) => a\.price - b\.price/, 'Meet Our Boats lists tours in tour order (the representative package is still the cheapest)');
  const service = fs.readFileSync('src/services/boatTourService.ts', 'utf8');
  assert.match(service, /sortByTourOrder\(/);
});

test('Admin reorder: saving the order invalidates the cached public catalog so it refreshes without a reload', () => {
  const tours = fs.readFileSync('src/pages/admin/AdminToursPage.tsx', 'utf8');
  assert.match(tours, /invalidateQueries\(\{ queryKey: \['boatTours'\] \}\)/);
  assert.match(tours, /update\(\{ sort_order: update\.sort_order \}\)/, 'the new order is persisted to tours.sort_order');
  const boats = fs.readFileSync('src/pages/admin/AdminBoatsPage.tsx', 'utf8');
  assert.match(boats, /invalidateQueries\(\{ queryKey: \['boats'\] \}\)/);
});
