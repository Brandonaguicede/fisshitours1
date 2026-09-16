import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`create table boat_tours(id uuid primary key);
    insert into boat_tours values ('11111111-1111-4111-8111-111111111111');
    create table bookings(id text primary key, tour_package_id text, time_slot_id text, tour_date date, boat_id text, meal_option text, booking_status text);
  `);
  const initial = fs.readFileSync('supabase/migrations/202608160001_initial_backend.sql', 'utf8');
  for (const table of ['tour_packages', 'time_slots']) {
    await db.exec(initial.match(new RegExp(`create table public.${table} \\([\\s\\S]*?\\n\\);`))[0]);
  }
  await db.exec(`insert into time_slots values ('morning','Morning','08:00',true,1), ('afternoon','Afternoon','13:00',true,2);
    insert into tour_packages(id,boat_tour_id,name,package_type,max_guests) values
    ('full','11111111-1111-4111-8111-111111111111','Full Day','full_day',10),
    ('half','11111111-1111-4111-8111-111111111111','Half Day','half_day',10);
    insert into bookings values ('legacy','full','afternoon','2027-01-01','boat','Retired meal','pending');`);
  const migration = fs.readFileSync('supabase/migrations/202609150002_package_schedules_and_meals.sql','utf8').replace(/^\uFEFF/, '');
  await db.exec(migration);
  assert.equal((await db.query(`select jsonb_array_length(meal_options) count from tour_packages where id='full'`)).rows[0].count, 7);
  await db.exec(`update tour_packages set departure_times = array['08:00','09:30','09:30'],
    meal_options = '[{"es":"Pescado con arroz","en":"Fish with rice"}]', package_included = array['Almuerzo incluido'] where id='full'`);
  assert.equal((await db.query(`select count(*)::int count from time_slots where starts_at='09:30'`)).rows[0].count,1);
  assert.deepEqual((await db.query(`select departure_times from tour_packages where id='half'`)).rows[0].departure_times,['08:00','13:00']);
  await db.exec(`update tour_packages set departure_times=array['09:30'] where id='half'`);
  assert.equal((await db.query(`select count(*)::int count from time_slots where starts_at='09:30'`)).rows[0].count,1);
  assert.deepEqual((await db.query(`select departure_times from tour_packages where id='full'`)).rows[0].departure_times,['08:00','09:30']);
  for (const sql of [
    `update tour_packages set departure_times=array['25:00'] where id='full'`,
    `update tour_packages set meal_options='{}' where id='full'`,
    `update tour_packages set meal_options='[{"es":"","en":"Fish"}]' where id='full'`,
    `update tour_packages set package_included=array[''] where id='full'`,
    `insert into bookings values ('bad-hour','full','afternoon','2027-01-01','boat',null,'pending')`,
    `insert into bookings values ('bad-meal','full','morning','2027-01-01','boat','Retired meal','pending')`,
  ]) await assert.rejects(() => db.exec(sql));
  await db.exec(`insert into bookings values ('new','full','departure-0930','2027-01-02','boat','Fish with rice','pending')`);
  await db.exec(`update bookings set meal_option='Pescado con arroz' where id='new'`);
  await db.exec(`update bookings set booking_status='confirmed' where id='legacy'`);
  await assert.rejects(() => db.exec(`update bookings set tour_date='2027-01-05' where id='legacy'`));
  await db.exec(`update bookings set tour_package_id='half' where id='new'`);
  assert.equal((await db.query(`select meal_option from bookings where id='new'`)).rows[0].meal_option,null);
  await db.exec(`update tour_packages set departure_times='{}' where id='half'`);
  await assert.rejects(() => db.exec(`insert into bookings values ('empty','half','morning','2027-01-01','boat',null,'pending')`));
  await db.exec(`begin; update tour_packages set departure_times=array['12:45'] where id='half'; rollback;`);
  assert.equal((await db.query(`select count(*)::int count from time_slots where starts_at='12:45'`)).rows[0].count,0);
  assert.equal((await db.query(`select meal_options->0->>'en' meal from tour_packages where id='full'`)).rows[0].meal,'Fish with rice');
  console.log('PASS: migration, existing schedule preservation, editable meals/inclusions, shared slot reuse, invalid input rejection, booking enforcement, existing reservation preservation and atomic rollback.');
} finally { await db.close(); }
