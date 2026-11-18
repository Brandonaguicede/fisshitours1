import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const base = fs.readFileSync('supabase/migrations/202611150001_measurement_attribution.sql', 'utf8');
const campaign = fs.readFileSync('supabase/migrations/202611170001_measurement_campaign_fields.sql', 'utf8');

async function database() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role');
  await db.exec('create table public.bookings (id uuid primary key)');
  await db.exec(base);
  await db.exec(campaign);
  await db.exec("insert into public.bookings(id) values ('00000000-0000-4000-8000-000000000001')");
  return db;
}

test('campaign attribution migration enforces format and category consent', async () => {
  const db = await database();
  try {
    const common = "'00000000-0000-4000-8000-000000000001', true, true, 1, now()";
    await db.exec(`insert into public.measurement_attribution
      (booking_id, analytics_consent, marketing_consent, consent_revision, captured_at, fbclid, utm_source, utm_medium)
      values (${common}, 'FbClick0123456789', 'google', 'cpc')`);
    const saved = (await db.query('select fbclid, utm_source, utm_medium from public.measurement_attribution')).rows[0];
    assert.deepEqual(saved, { fbclid: 'FbClick0123456789', utm_source: 'google', utm_medium: 'cpc' });

    await assert.rejects(db.exec(`update public.measurement_attribution set marketing_consent=false`), /measurement_attribution_fbclid_consent/);
    await assert.rejects(db.exec(`update public.measurement_attribution set analytics_consent=false`), /measurement_attribution_campaign_consent/);
    await assert.rejects(db.exec(`update public.measurement_attribution set fbclid='bad'`), /measurement_attribution_fbclid_format/);
    await assert.rejects(db.exec(`update public.measurement_attribution set utm_source='contains spaces'`), /measurement_attribution_campaign_format/);
  } finally {
    await db.close();
  }
});
