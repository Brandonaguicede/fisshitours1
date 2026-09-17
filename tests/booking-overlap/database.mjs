import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`
    create table tours(id text primary key, operating_end_time time, active boolean default true);
    create table tour_packages(id text primary key, duration_minutes integer, departure_times text[], active boolean default true);
    create table time_slots(id text primary key, starts_at time, active boolean default true);
    create table availability_blocks(id serial primary key, boat_id text, tour_date date, time_slot_id text, active boolean, booking_id text);
    create table bookings(id text primary key, boat_id text, tour_id text, tour_date date, time_slot_id text, tour_package_id text, booking_status text, expires_at timestamptz);
    create unique index availability_blocks_one_active_slot on availability_blocks(boat_id,tour_date,time_slot_id) where active;
    insert into tours values ('tour-day',null,true),('tour-limited','18:30',true),('tour-night','23:30',true);
    insert into tour_packages values ('full',480,array['07:00'],true),('half',240,array['01:00','03:00','06:00','07:00','10:00','12:00','13:00','15:00','16:00','17:00'],true),('four',240,array['03:00','06:00','07:00','10:00','12:00','13:00','15:00','16:00','17:00'],true),('long',600,array['03:00','06:00','07:00','10:00','12:00','13:00','15:00','16:00','17:00'],true),('late-full',480,array['07:00','10:30','11:30','15:00','15:30','18:30'],true),('arbitrary',300,array['07:00','11:30'],true),('buffer-before',270,array['07:00'],true);
    insert into time_slots values ('t01','01:00',true),('t03','03:00',true),('t06','06:00',true),('t07','07:00',true),('t10','10:00',true),('t1030','10:30',true),('t1130','11:30',true),('t12','12:00',true),('t13','13:00',true),('t15','15:00',true),('t1530','15:30',true),('t16','16:00',true),('t17','17:00',true),('t1830','18:30',true);
  `);
  await db.exec(fs.readFileSync('supabase/migrations/202609160002_prevent_overlapping_boat_bookings.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/202609160003_operational_hours_and_boat_buffer.sql','utf8'));

  async function book(id, boat, date, time, pkg, status = 'confirmed', expiresAt = null, tourId = 'tour-day') {
    await db.query('insert into bookings values ($1,$2,$3,$4,$5,$6,$7,$8)', [id,boat,tourId,date,time,pkg,status,expiresAt]);
  }
  async function rejectsConflict(action) {
    await assert.rejects(action, /BOAT_TIME_CONFLICT/);
  }

  await book('base','A','2026-10-10','t07','full');
  await rejectsConflict(() => book('overlap-after','A','2026-10-10','t13','half'));
  await rejectsConflict(() => book('contains','A','2026-10-10','t06','long'));
  await rejectsConflict(() => book('starts-before-ends-inside','A','2026-10-10','t06','half'));
  await rejectsConflict(() => book('starts-inside-ends-after','A','2026-10-10','t13','long'));
  await book('touches-end','A','2026-10-14','t07','half');
  await book('touches-start','A','2026-10-10','t01','half');
  await book('another-date','A','2026-10-11','t13','half');
  await book('another-boat','B','2026-10-10','t13','half');
  await book('cancelled-does-not-block','A','2026-10-12','t07','full','cancelled');
  await book('after-cancelled','A','2026-10-12','t13','half');
  await rejectsConflict(() => db.query("update bookings set booking_status='confirmed', tour_date='2026-10-10', time_slot_id='t13', tour_package_id='half' where id='cancelled-does-not-block'"));
  await rejectsConflict(() => book('direct-without-availability-query','A','2026-10-10','t12','half'));
  await rejectsConflict(() => db.query("update bookings set tour_date='2026-10-10', time_slot_id='t13', tour_package_id='half' where id='touches-end'"));
  await assert.rejects(() => book('outside-commercial-schedule','A','2026-10-13','t10','full'), /not allowed for this package/);

  // Exact mandatory cases: 15:30-23:30 blocks 18:30-02:30 on the same boat/date.
  await book('late-existing','A','2026-10-20','t1530','late-full');
  await rejectsConflict(() => book('late-overlap','A','2026-10-20','t1830','late-full'));
  // Same interval on another boat and on another date is allowed.
  await book('late-other-boat','B','2026-10-20','t1830','late-full');
  await book('late-other-date','A','2026-10-21','t1830','late-full');
  // Exact adjacency 15:00-23:00 after 07:00-15:00 is allowed.
  await book('adjacent-full','A','2026-10-22','t07','half');
  await book('adjacent-next','A','2026-10-22','t15','late-full');
  // An expired PayPal hold does not block its interval.
  await book('expired-paypal','A','2026-10-23','t1530','late-full','pending_payment','2020-01-01T00:00:00Z');
  await book('after-expired-paypal','A','2026-10-23','t1830','late-full');
  // The buffer applies in both directions: an earlier booking ending at 11:30
  // occupies the boat until 13:30 and conflicts with a 13:00 booking.
  await book('future-booking','A','2026-10-28','t13','half');
  await rejectsConflict(() => book('buffer-before','A','2026-10-28','t07','buffer-before'));
  await book('buffer-existing','A','2026-10-29','t07','half');
  await rejectsConflict(() => book('buffer-next','A','2026-10-29','t12','half'));
  // Operating end uses tour configuration, not package or tour names.
  await book('ends-at-operating-limit','A','2026-10-24','t1030','late-full','confirmed',null,'tour-limited');
  await assert.rejects(() => book('past-operating-limit','A','2026-10-25','t1130','late-full','confirmed',null,'tour-limited'), /OUTSIDE_OPERATING_HOURS/);
  await assert.rejects(() => book('crosses-midnight-operating-limit','A','2026-10-26','t1830','late-full','confirmed',null,'tour-limited'), /OUTSIDE_OPERATING_HOURS/);
  await book('night-tour-configured-later','A','2026-10-26','t15','late-full','confirmed',null,'tour-night');
  await book('arbitrary-duration','A','2026-10-27','t07','arbitrary');
  console.log('PASS: SQL guard covers same-boat/date overlap including midnight, rejects direct conflicts, allows other boats/dates and exact adjacency, ignores cancelled and expired holds, and enforces departure_times.');
} finally {
  await db.close();
}
