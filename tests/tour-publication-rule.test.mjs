// Rule: a tour needs at least one SELLABLE package to be published; otherwise it is a draft (Admin and public agree). Real code under test:
// src/services/tourPublicationService.ts (bundled by Vite) with the real "sellable" definition (src/utils/packageRequirements.ts); the fake database
// reproduces what the real one does that matters here: the join rows, the filters, and `active` following `publication_status` (DB trigger).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { build } from 'vite';

const output = await build({
  configFile: false, logLevel: 'error',
  plugins: [{ name: 'fake-supabase', enforce: 'pre', resolveId: (id) => (id.endsWith('/lib/supabase') ? '\0fake-supabase' : null), load: (id) => (id === '\0fake-supabase' ? 'export const supabase = new Proxy({}, { get: (_, name) => (...args) => globalThis.__fakeSupabase[name](...args) });' : null) }],
  build: { write: false, lib: { entry: 'src/services/tourPublicationService.ts', formats: ['es'], fileName: 'tour-publication' } },
});
const service = await import(`data:text/javascript;base64,${Buffer.from((Array.isArray(output) ? output[0] : output).output[0].code).toString('base64')}`);
const { loadSellableTourIds, isTourPublishable, demoteUnsellablePublishedTours, describeDemotedTours } = service;

function database({ tours, packages, generalTimes = 2 }) {
  const state = { tours: tours.map((tour) => ({ ...tour })), packages, generalTimes, updates: [] };
  const query = (name) => {
    let filters = [];
    let patch = null;
    let head = false;
    const rows = () => (name === 'tours' ? state.tours : name === 'tour_packages' ? state.packages : []).filter((row) => filters.every(([column, value]) => row[column] === value));
    const q = {
      select: (_columns, options) => { head = Boolean(options?.head); return q; },
      eq: (column, value) => { filters.push([column, value]); return q; },
      update: (values) => { patch = values; return q; },
      in: (column, values) => {
        for (const row of state.tours.filter((item) => values.includes(item[column]))) {
          Object.assign(row, patch);
          if ('publication_status' in patch) row.active = patch.publication_status === 'published'; // tours_sync_publication_status trigger
        }
        state.updates.push({ values, patch });
        return Promise.resolve({ error: null });
      },
      then: (resolve) => {
        if (name === 'time_slots') return resolve({ count: state.generalTimes, data: null, error: null });
        return resolve({ data: head ? null : rows(), error: null });
      },
    };
    return q;
  };
  globalThis.__fakeSupabase = { from: (name) => query(name) };
  return state;
}

// A complete, bookable package of a tour on a boat (everything active). Overrides break one link of the chain at a time.
function pkg(tourId, overrides = {}) {
  const { link = true, boat = true, ...own } = overrides;
  return {
    id: `pkg-${tourId}-${Math.random().toString(36).slice(2, 7)}`, name: 'Half Day', active: true, custom_quote: false, base_price: 700, included_guests: 4, max_guests: 10,
    extra_guest_price: 50, duration_minutes: 240, departure_times: null, ...own,
    boat_tours: { tour_id: tourId, active: link, boats: { active: boat } },
  };
}
const tour = (id, order, status = 'published') => ({ id, title: `Tour ${id}`, sort_order: order, publication_status: status, active: status === 'published' });
const statusOf = (state) => Object.fromEntries(state.tours.map((item) => [item.id, item.publication_status]));

test('a tour with NO packages is not sellable, cannot be published, and a published one goes to draft', async () => {
  const state = database({ tours: [tour('a', 1), tour('empty', 2)], packages: [pkg('a')] });
  assert.equal(await isTourPublishable('empty'), false);
  assert.equal(await isTourPublishable('a'), true);
  const demoted = await demoteUnsellablePublishedTours();
  assert.deepEqual(demoted.map((item) => item.id), ['empty']);
  assert.deepEqual(statusOf(state), { a: 'published', empty: 'draft' });
  assert.equal(state.tours.find((item) => item.id === 'empty').active, false, 'Admin does not say Activo while the public hides it');
});

test('a tour whose packages are ALL inactive is a draft', async () => {
  const state = database({ tours: [tour('t', 1)], packages: [pkg('t', { active: false }), pkg('t', { active: false })] });
  assert.equal(await isTourPublishable('t'), false);
  await demoteUnsellablePublishedTours();
  assert.equal(statusOf(state).t, 'draft');
});

test('an active package does not count when its boat link or its boat is inactive', async () => {
  for (const broken of [{ link: false }, { boat: false }]) {
    const state = database({ tours: [tour('t', 1)], packages: [pkg('t', broken)] });
    assert.equal(await isTourPublishable('t'), false, JSON.stringify(broken));
    await demoteUnsellablePublishedTours();
    assert.equal(statusOf(state).t, 'draft', JSON.stringify(broken));
  }
});

test('"sellable" is the real definition: an incomplete active package or a custom quote does not make a tour publishable; one complete package does', async () => {
  for (const unfit of [{ base_price: 0 }, { duration_minutes: null }, { name: '' }, { custom_quote: true }, { departure_times: [] }]) {
    database({ tours: [tour('t', 1)], packages: [pkg('t', unfit)] });
    assert.equal(await isTourPublishable('t'), false, JSON.stringify(unfit));
  }
  database({ tours: [tour('t', 1)], packages: [pkg('t', { departure_times: ['07:00'] })] });
  assert.equal(await isTourPublishable('t'), true);
  database({ tours: [tour('t', 1)], packages: [pkg('t')], generalTimes: 0 });
  assert.equal(await isTourPublishable('t'), false, 'a package that inherits the shared hours needs at least one active shared hour');
});

test('a published tour that LOSES its last sellable package goes to draft; a tour with another sellable package does not', async () => {
  const packages = [pkg('t', { id: 'only' }), pkg('two', { id: 'one' }), pkg('two', { id: 'other' })];
  const state = database({ tours: [tour('t', 1), tour('two', 2)], packages });
  assert.deepEqual(await demoteUnsellablePublishedTours(), []);
  packages.find((row) => row.id === 'only').active = false; // the last package of "t" is switched off
  packages.find((row) => row.id === 'one').active = false;  // "two" still has 'other'
  const demoted = await demoteUnsellablePublishedTours();
  assert.deepEqual(demoted.map((item) => item.id), ['t']);
  assert.deepEqual(statusOf(state), { t: 'draft', two: 'published' });
  assert.match(describeDemotedTours(demoted), /"Tour t" pasó a borrador porque ya no tiene paquetes activos disponibles/);
});

test('getting a sellable package again does NOT republish: the tour stays draft but becomes eligible; a person publishes it', async () => {
  const packages = [pkg('t', { id: 'p', active: false })];
  const state = database({ tours: [tour('t', 1, 'draft')], packages });
  assert.equal(await isTourPublishable('t'), false);
  packages.find((row) => row.id === 'p').active = true;
  assert.equal(await isTourPublishable('t'), true, 'eligible again');
  assert.deepEqual(await demoteUnsellablePublishedTours(), []);
  assert.equal(statusOf(state).t, 'draft', 'still draft: nothing publishes it automatically');
  assert.equal(state.updates.length, 0, 'no write at all');
});

test('demoting a tour never renumbers sort_order, so the public list keeps the relative Admin order (1 A, 2 B draft, 3 C -> A, C)', async () => {
  const state = database({ tours: [tour('a', 1), tour('b', 2), tour('c', 3)], packages: [pkg('a'), pkg('c')] });
  await demoteUnsellablePublishedTours();
  assert.deepEqual(state.tours.map((item) => [item.id, item.sort_order, item.publication_status]), [['a', 1, 'published'], ['b', 2, 'draft'], ['c', 3, 'published']]);
  assert.deepEqual(state.tours.filter((item) => item.active).map((item) => item.id), ['a', 'c']);
});

test('PRODUCTION CASE "Fishing tour 2": published, its two boat links inactive and its 3 packages inactive -> draft; the other seven tours are untouched', async () => {
  const seven = Array.from({ length: 7 }, (_, index) => tour(`t${index + 1}`, index + 1));
  const fishing2 = tour('fishing-2', 8);
  const packages = [...seven.map((item) => pkg(item.id)), pkg('fishing-2', { link: false, active: false }), pkg('fishing-2', { link: false, active: false }), pkg('fishing-2', { link: false, active: false })];
  const state = database({ tours: [...seven, fishing2], packages });
  const sellable = await loadSellableTourIds();
  assert.equal(sellable.size, 7);
  assert.ok(!sellable.has('fishing-2'));
  const demoted = await demoteUnsellablePublishedTours();
  assert.deepEqual(demoted.map((item) => item.title), ['Tour fishing-2']);
  assert.equal(state.tours.find((item) => item.id === 'fishing-2').publication_status, 'draft');
  assert.equal(state.tours.find((item) => item.id === 'fishing-2').sort_order, 8);
  assert.equal(state.tours.filter((item) => item.publication_status === 'published').length, 7);
  assert.ok(packages.filter((row) => row.boat_tours.tour_id === 'fishing-2').every((row) => row.active === false), 'its packages are NOT reactivated');
});

test('wiring: every path that can publish or remove a sellable package goes through the rule, and Admin explains it', () => {
  const tours = fs.readFileSync('src/pages/admin/AdminToursPage.tsx', 'utf8');
  assert.match(tours, /publication_status: publishable \? 'published' : 'draft'/, 'finishing the wizard publishes only if publishable, otherwise saves as draft');
  assert.match(tours, /TOUR_SAVED_AS_DRAFT_NOTICE/);
  assert.match(tours, /isTourPublishable\(tour\.id\)/, '"Mostrar tour" is gated too');
  assert.match(tours, /TOUR_CANNOT_PUBLISH_NOTICE/);
  const service = fs.readFileSync('src/services/adminBoatToursService.ts', 'utf8');
  for (const fn of ['savePackageForBoatTour', 'setPackageActive', 'deletePackage', 'disableTourForBoat']) assert.match(service, new RegExp(`export async function ${fn}\\([^)]*\\): Promise<DemotedTour\\[\\]>`, 's'), `${fn} reports demoted tours`);
  assert.equal((service.match(/return demoteUnsellablePublishedTours\(\)/g) ?? []).length, 4);
  const editor = fs.readFileSync('src/components/admin/BoatToursPackagesEditor.tsx', 'utf8');
  assert.match(editor, /TOUR_PUBLICATION_REQUIREMENT/);
  assert.match(editor, /TOUR_PUBLISHABLE_NOTICE/);
  const boats = fs.readFileSync('src/pages/admin/AdminBoatsPage.tsx', 'utf8');
  assert.match(boats, /tourDemotionNote\(\)/);
  const catalog = fs.readFileSync('src/utils/tourCatalog.ts', 'utf8');
  assert.match(catalog, /isSellablePackage\(item\.catalogActive !== false, bookableFacts\(item\)\)/, 'the public catalog uses the same definition');
});
