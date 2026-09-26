// boats.publication_status migration + trigger, run against a real Postgres (PGlite, in-process WASM — no Supabase project, no network).
// The migration is executed exactly as written in supabase/migrations against a minimal boats table holding pre-migration rows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync('supabase/migrations/202609250001_boat_publication_status.sql', 'utf8');

async function migratedDb() {
  const db = new PGlite();
  // Pre-migration shape: only `active`.
  await db.exec(`
    create table public.boats (id text primary key, name text not null, active boolean not null default true, sort_order int not null default 0);
    insert into public.boats (id, name, active) values ('visible-boat', 'Visible', true), ('hidden-boat', 'Hidden', false);
  `);
  await db.exec(migration);
  return db;
}
const rows = async (db) => Object.fromEntries((await db.query('select id, publication_status, active from public.boats order by id')).rows.map((row) => [row.id, [row.publication_status, row.active]]));

test('migration: existing boats keep their decision — active -> published, inactive -> inactive (never draft)', async () => {
  const db = await migratedDb();
  assert.deepEqual(await rows(db), { 'hidden-boat': ['inactive', false], 'visible-boat': ['published', true] });
  await db.close();
});

test('migration: re-running it does not turn drafts (or anything else) back — drafts and inactive stay as they are', async () => {
  const db = await migratedDb();
  await db.exec(`insert into public.boats (id, name, publication_status) values ('a-draft', 'Draft', 'draft')`);
  await db.exec(migration);
  assert.deepEqual(await rows(db), { 'a-draft': ['draft', false], 'hidden-boat': ['inactive', false], 'visible-boat': ['published', true] });
  await db.close();
});

test('column: only draft / published / inactive are valid, and a new row defaults to published (like tours)', async () => {
  const db = await migratedDb();
  await assert.rejects(db.exec(`update public.boats set publication_status = 'archived' where id = 'visible-boat'`), /check|constraint/i);
  await db.exec(`insert into public.boats (id, name) values ('plain', 'Plain')`);
  assert.deepEqual((await rows(db)).plain, ['published', true]);
  await db.close();
});

test('trigger: draft -> active=false, published -> active=true, inactive -> active=false (on update and on insert)', async () => {
  const db = await migratedDb();
  for (const [status, active] of [['draft', false], ['published', true], ['inactive', false], ['published', true], ['draft', false]]) {
    await db.exec(`update public.boats set publication_status = '${status}' where id = 'visible-boat'`);
    assert.deepEqual((await rows(db))['visible-boat'], [status, active], `update to ${status}`);
  }
  for (const [status, active] of [['draft', false], ['published', true], ['inactive', false]]) {
    await db.exec(`insert into public.boats (id, name, publication_status) values ('new-${status}', 'New', '${status}')`);
    assert.deepEqual((await rows(db))[`new-${status}`], [status, active], `insert as ${status}`);
  }
  // A draft / inactive insert never ends up visible, even if `active` is (wrongly) true.
  await db.exec(`insert into public.boats (id, name, publication_status, active) values ('draft-true', 'X', 'draft', true), ('inactive-true', 'Y', 'inactive', true)`);
  assert.deepEqual((await rows(db))['draft-true'], ['draft', false]);
  assert.deepEqual((await rows(db))['inactive-true'], ['inactive', false]);
  await db.close();
});

test('trigger: editing other columns never flips the state (name, sort_order)', async () => {
  const db = await migratedDb();
  await db.exec(`update public.boats set publication_status = 'draft' where id = 'visible-boat'`);
  await db.exec(`update public.boats set name = 'Renamed', sort_order = 9 where id = 'visible-boat'`);
  assert.deepEqual((await rows(db))['visible-boat'], ['draft', false]);
  await db.close();
});

test('the public filter keeps working: filtering on active=true returns exactly the published boats', async () => {
  const db = await migratedDb();
  await db.exec(`
    insert into public.boats (id, name, publication_status) values ('d', 'D', 'draft'), ('i', 'I', 'inactive'), ('p', 'P', 'published');
  `);
  const visible = (await db.query('select id from public.boats where active = true order by id')).rows.map((row) => row.id);
  assert.deepEqual(visible, ['p', 'visible-boat']);
  await db.close();
});

test('safety: a write that only touches `active` (SQL editor, old script) can never desync the two columns', async () => {
  const db = await migratedDb();
  await db.exec(`insert into public.boats (id, name, publication_status) values ('a-draft', 'Draft', 'draft'), ('an-inactive', 'Inactive', 'inactive')`);
  // Hide a published boat directly -> inactive (not published-but-hidden).
  await db.exec(`update public.boats set active = false where id = 'visible-boat'`);
  assert.deepEqual((await rows(db))['visible-boat'], ['inactive', false]);
  // Show it again directly -> published.
  await db.exec(`update public.boats set active = true where id = 'visible-boat'`);
  assert.deepEqual((await rows(db))['visible-boat'], ['published', true]);
  // Showing a draft / an inactive boat directly publishes it; hiding a draft leaves it a draft.
  await db.exec(`update public.boats set active = true where id in ('a-draft', 'an-inactive')`);
  assert.deepEqual((await rows(db))['a-draft'], ['published', true]);
  assert.deepEqual((await rows(db))['an-inactive'], ['published', true]);
  await db.exec(`update public.boats set publication_status = 'draft' where id = 'a-draft'`);
  await db.exec(`update public.boats set active = false where id = 'a-draft'`);
  assert.deepEqual((await rows(db))['a-draft'], ['draft', false]);
  // The invariant holds for every row after all of that.
  const broken = await db.query(`select id from public.boats where active <> (publication_status = 'published')`);
  assert.deepEqual(broken.rows, []);
  await db.close();
});

test('safety: a legacy insert with only `active = false` (no status) becomes inactive, never a visible boat; with nothing it is published (default)', async () => {
  const db = await migratedDb();
  await db.exec(`insert into public.boats (id, name, active) values ('legacy-hidden', 'H', false)`);
  await db.exec(`insert into public.boats (id, name) values ('legacy-default', 'D')`);
  const state = await rows(db);
  assert.deepEqual(state['legacy-hidden'], ['inactive', false]);
  assert.deepEqual(state['legacy-default'], ['published', true]);
  await db.close();
});

test('the Admin write shape (publication_status only, sometimes with sort_order / updated_at) behaves exactly like Tours', async () => {
  const db = await migratedDb();
  await db.exec(`update public.boats set publication_status = 'draft', sort_order = 3 where id = 'visible-boat'`);
  assert.deepEqual((await rows(db))['visible-boat'], ['draft', false]);
  await db.exec(`update public.boats set publication_status = 'draft' where id = 'visible-boat'`); // same status again: nothing flips
  assert.deepEqual((await rows(db))['visible-boat'], ['draft', false]);
  await db.exec(`update public.boats set publication_status = 'published' where id = 'visible-boat'`);
  assert.deepEqual((await rows(db))['visible-boat'], ['published', true]);
  await db.close();
});
