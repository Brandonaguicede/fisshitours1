import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`
    create table tour_packages(id text primary key, duration_minutes integer, departure_times text[], active boolean default true);
    create table time_slots(id text primary key, starts_at time, active boolean default true);
    create table availability_blocks(id serial primary key, boat_id text, tour_date date, time_slot_id text, active boolean, booking_id text);
    create table bookings(id text primary key, boat_id text, tour_date date, time_slot_id text, tour_package_id text, booking_status text, expires_at timestamptz);
    create unique index availability_blocks_one_active_slot on availability_blocks(boat_id,tour_date,time_slot_id) where active;
    insert into tour_packages values ('full',480,array['07:00'],true),('half',240,array['03:00','06:00','07:00','10:00','12:00','13:00','15:00','16:00','17:00'],true),('four',240,array['03:00','06:00','07:00','10:00','12:00','13:00','15:00','16:00','17:00'],true),('long',600,array['03:00','06:00','07:00','10:00','12:00','13:00','15:00','16:00','17:00'],true);
    insert into time_slots values ('t03','03:00',true),('t06','06:00',true),('t07','07:00',true),('t10','10:00',true),('t12','12:00',true),('t13','13:00',true),('t15','15:00',true),('t16','16:00',true),('t17','17:00',true);
  `);
  await db.exec(fs.readFileSync('supabase/migrations/202609160001_prevent_overlapping_boat_bookings.sql','utf8'));

  async function book(id, boat, date, time, pkg, status = 'confirmed') {
    await db.query('insert into bookings values ($1,$2,$3,$4,$5,$6,null)', [id,boat,date,time,pkg,status]);
  }
  async function rejectsConflict(action) {
    await assert.rejects(action, /BOAT_TIME_CONFLICT/);
  }

  await book('base','A','2026-10-10','t07','full');
  await rejectsConflict(() => book('overlap-after','A','2026-10-10','t13','half'));
  await rejectsConflict(() => book('contains','A','2026-10-10','t06','long'));
  await rejectsConflict(() => book('starts-before-ends-inside','A','2026-10-10','t06','half'));
  await rejectsConflict(() => book('starts-inside-ends-after','A','2026-10-10','t13','long'));
  await book('touches-end','A','2026-10-10','t15','half');
  await book('touches-start','A','2026-10-10','t03','half');
  await book('another-date','A','2026-10-11','t13','half');
  await book('another-boat','B','2026-10-10','t13','half');
  await book('cancelled-does-not-block','A','2026-10-12','t07','full','cancelled');
  await book('after-cancelled','A','2026-10-12','t13','half');
  await rejectsConflict(() => db.query("update bookings set booking_status='confirmed', tour_date='2026-10-10', time_slot_id='t13', tour_package_id='half' where id='cancelled-does-not-block'"));
  await rejectsConflict(() => book('direct-without-availability-query','A','2026-10-10','t12','half'));
  await rejectsConflict(() => db.query("update bookings set time_slot_id='t13', tour_package_id='half' where id='touches-end'"));
  await assert.rejects(() => book('outside-commercial-schedule','A','2026-10-13','t10','full'), /not allowed for this package/);

  console.log('PASS: SQL booking guard rejects four overlap shapes and direct inserts, allows adjacent intervals, other dates/boats and cancelled history, and enforces package departure_times.');
} finally {
  await db.close();
}
