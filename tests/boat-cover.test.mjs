// A boat's cover is the FIRST photo of its gallery — one rule for the public site, the Admin gallery and the database.
// Real code under test: the public service (src/services/boatService.ts, bundled by Vite), the migration (run on a real Postgres via PGlite) and the
// Admin source. Production had Foto 2 flagged as "Portada" (is_primary) on several boats and the public site showed it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { build } from 'vite';

// ---- database: boat_images.is_primary is derived from the gallery order ------------------------------------------------------------------------

const migration = fs.readFileSync('supabase/migrations/202610090003_boat_cover_is_first_image.sql', 'utf8');

async function db() {
  const pg = new PGlite();
  // The production shape that matters: the one-active-primary index, and a gallery whose flag drifted to Foto 2 (plus soft-deleted rows).
  await pg.exec(`
    create table public.boats (id text primary key, name text not null);
    create table public.boat_images (
      id uuid primary key default gen_random_uuid(), boat_id text not null references public.boats(id) on delete cascade, image_url text not null,
      is_primary boolean not null default false, sort_order int not null default 0, active boolean not null default true, pending_deletion boolean not null default false,
      created_at timestamptz not null default now()
    );
    create unique index boat_images_one_primary_active on public.boat_images (boat_id) where is_primary = true and active = true;
    insert into public.boats values ('second-wind', 'Second Wind'), ('gamefish', 'Gamefish');
    insert into public.boat_images (boat_id, image_url, is_primary, sort_order, active, pending_deletion, created_at) values
      ('second-wind', 'sw-1', false, 0, true,  false, '2026-01-01'),
      ('second-wind', 'sw-2', true,  1, true,  false, '2026-01-02'),
      ('second-wind', 'sw-old', false, 1, false, false, '2026-01-03'),
      ('second-wind', 'sw-gone', true, 2, false, true,  '2026-01-04'),
      ('second-wind', 'sw-3', false, 3, true,  false, '2026-01-05'),
      ('gamefish', 'gf-1', true, 0, true, false, '2026-02-01'),
      ('gamefish', 'gf-2', false, 1, true, false, '2026-02-02');
  `);
  await pg.exec(migration);
  return pg;
}
const gallery = async (pg, boat) => (await pg.query(`select image_url, is_primary from public.boat_images where boat_id = $1 and active order by sort_order, created_at, id`, [boat])).rows;
const cover = async (pg, boat) => (await pg.query(`select image_url from public.boat_images where boat_id = $1 and active and is_primary`, [boat])).rows.map((row) => row.image_url);

test('migration: Foto 2 flagged as cover moves to Foto 1; boats that were right stay as they were; soft-deleted rows lose the flag', async () => {
  const pg = await db();
  assert.deepEqual(await cover(pg, 'second-wind'), ['sw-1']);
  assert.deepEqual(await cover(pg, 'gamefish'), ['gf-1']);
  assert.equal((await pg.query(`select count(*)::int n from public.boat_images where is_primary and not active`)).rows[0].n, 0);
  await pg.close();
});

test('database: inserting a photo at the front makes it the cover; reordering moves the cover with the new first photo', async () => {
  const pg = await db();
  await pg.exec(`insert into public.boat_images (boat_id, image_url, sort_order, created_at) values ('second-wind', 'sw-new-front', -1, '2026-03-01')`);
  assert.deepEqual(await cover(pg, 'second-wind'), ['sw-new-front']);
  // Admin reorder: sw-3 goes first.
  await pg.exec(`update public.boat_images set sort_order = -5 where image_url = 'sw-3'`);
  assert.deepEqual(await cover(pg, 'second-wind'), ['sw-3']);
  assert.equal((await gallery(pg, 'second-wind'))[0].image_url, 'sw-3');
  await pg.close();
});

test('database: deleting or deactivating the cover promotes the NEXT photo by order (no photo is skipped, exactly one cover)', async () => {
  const pg = await db();
  await pg.exec(`update public.boat_images set active = false where image_url = 'sw-1'`);
  assert.deepEqual(await cover(pg, 'second-wind'), ['sw-2']);
  await pg.exec(`delete from public.boat_images where image_url = 'sw-2'`);
  assert.deepEqual(await cover(pg, 'second-wind'), ['sw-3']);
  await pg.exec(`update public.boat_images set active = false where boat_id = 'second-wind'`);
  assert.deepEqual(await cover(pg, 'second-wind'), [], 'no active photos -> no cover');
  await pg.close();
});

test('database: clearing the cover flag by hand is put back on Foto 1, moving it to another photo is refused by the one-primary index, boats do not affect each other, and the migration is idempotent', async () => {
  const pg = await db();
  await pg.exec(`update public.boat_images set is_primary = false where image_url = 'gf-1'`);
  assert.deepEqual(await cover(pg, 'gamefish'), ['gf-1'], 'the flag is restored from the order');
  await assert.rejects(pg.exec(`update public.boat_images set is_primary = true where image_url = 'gf-2'`), /boat_images_one_primary_active/);
  assert.deepEqual(await cover(pg, 'gamefish'), ['gf-1']);
  assert.deepEqual(await cover(pg, 'second-wind'), ['sw-1'], 'the other boat is untouched');
  await pg.exec(migration);
  await pg.exec(migration);
  assert.deepEqual(await cover(pg, 'second-wind'), ['sw-1']);
  assert.deepEqual(await cover(pg, 'gamefish'), ['gf-1']);
  await pg.close();
});

// ---- public service: the cover is gallery[0], whatever the flag says --------------------------------------------------------------------------

const output = await build({
  configFile: false, logLevel: 'error',
  plugins: [{ name: 'fake-supabase', enforce: 'pre', resolveId: (id) => (id.endsWith('/lib/supabase') ? '\0fake-supabase' : null), load: (id) => (id === '\0fake-supabase' ? 'export const supabase = new Proxy({}, { get: (_, name) => (...args) => globalThis.__fakeSupabase[name](...args) });' : null) }],
  build: { write: false, lib: { entry: 'src/services/boatService.ts', formats: ['es'], fileName: 'boat-service' } },
});
const { getActiveBoats } = await import(`data:text/javascript;base64,${Buffer.from((Array.isArray(output) ? output[0] : output).output[0].code).toString('base64')}`);

function publicBoats({ boats, images }) {
  const table = { boats, boat_equipment: [], boat_images: images };
  const query = (name) => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, then: (resolve) => resolve({ data: table[name], error: null }) }; return q; };
  globalThis.__fakeSupabase = { from: (name) => query(name) };
  return getActiveBoats();
}
const boatRow = (id, name, sort_order) => ({ id, slug: id, name, image_url: 'legacy-cover.jpg', images: null, badge: null, length: '32ft', engine: 'Yamaha', max_guests: 10, featured_spec: null, active: true, sort_order });
const photo = (id, boat_id, image_url, sort_order, extra = {}) => ({ id, boat_id, image_url, alt_text: '', sort_order, created_at: '2026-01-01T00:00:00Z', ...extra });

test('public: Foto 1 is the cover even when the (legacy) is_primary flag sits on Foto 2 — the exact production defect', async () => {
  const [boat] = await publicBoats({
    boats: [boatRow('second-wind', 'Second Wind', 1)],
    images: [photo('a', 'second-wind', 'foto-1.webp', 0, { is_primary: false }), photo('b', 'second-wind', 'foto-2.webp', 1, { is_primary: true }), photo('c', 'second-wind', 'foto-3.webp', 3, { is_primary: false })],
  });
  assert.equal(boat.image, 'foto-1.webp');
  assert.equal(JSON.stringify(boat.images), JSON.stringify(['foto-1.webp', 'foto-2.webp', 'foto-3.webp']), 'the gallery keeps its own order, cover first');
});

test('public: reordering the gallery changes the cover; the second photo is never promoted by accident', async () => {
  const images = [photo('a', 'bote', 'foto-1.webp', 0), photo('b', 'bote', 'foto-2.webp', 1), photo('c', 'bote', 'foto-3.webp', 2)];
  assert.equal((await publicBoats({ boats: [boatRow('bote', 'Bote', 1)], images }))[0].image, 'foto-1.webp');
  // Admin moves foto-3 to the front.
  const reordered = [photo('a', 'bote', 'foto-1.webp', 1), photo('b', 'bote', 'foto-2.webp', 2), photo('c', 'bote', 'foto-3.webp', 0)];
  const [boat] = await publicBoats({ boats: [boatRow('bote', 'Bote', 1)], images: reordered });
  assert.equal(boat.image, 'foto-3.webp');
  assert.equal(boat.images[0], 'foto-3.webp');
  assert.notEqual(boat.image, 'foto-2.webp');
});

test('public: two photos with the same position resolve by creation time (stable, repeatable); a boat without gallery rows keeps its own image', async () => {
  const tied = [photo('b', 'bote', 'creada-despues.webp', 0, { created_at: '2026-02-01T00:00:00Z' }), photo('a', 'bote', 'creada-primero.webp', 0, { created_at: '2026-01-01T00:00:00Z' })];
  const boats = await publicBoats({ boats: [boatRow('bote', 'Bote', 1), boatRow('sin-fotos', 'Sin fotos', 2)], images: tied });
  assert.equal(boats[0].image, 'creada-primero.webp');
  assert.equal(boats[1].image, 'legacy-cover.jpg');
});

// ---- Admin: the "Portada" label and the derived columns use the same rule -------------------------------------------------------------------------

test('Admin: "Portada" is position 0 of the ordered gallery and boats.image_url comes from the same rule (no independent is_primary decision)', () => {
  const source = fs.readFileSync('src/pages/admin/AdminBoatsPage.tsx', 'utf8');
  assert.match(source, /cover: index === 0/);
  assert.doesNotMatch(source, /cover: Boolean\(image\.is_primary\)/);
  assert.match(source, /const primary = boatCover\(activeImages\)/);
  assert.doesNotMatch(source, /activeImages\.find\(\(image\) => image\.is_primary\)/);
  assert.doesNotMatch(source, /update\(\{ is_primary: true \}\)/, 'no hand-moved cover on delete: the first remaining photo is the cover by order');
  const service = fs.readFileSync('src/services/boatService.ts', 'utf8');
  assert.doesNotMatch(service.replace(/\/\/.*$/gm, ''), /is_primary/, 'the public service never reads the flag');
});
