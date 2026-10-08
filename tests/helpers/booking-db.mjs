// A real-Postgres (PGlite) booking schema built from the project's own migrations, with the seed data the booking RPCs need.
// Shared by the tests that exercise create_booking_transaction / the bookings triggers for real.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (name) => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');
export const TERMS_MIGRATION = read('202610080001_booking_terms_and_language.sql'); // step 1: additive, backward compatible
export const REQUIRE_TERMS_MIGRATION = read('202610080002_require_booking_terms.sql'); // step 2: acceptance mandatory (applied last)

export const bookingPayload = (overrides = {}) => ({
  customer: { fullName: 'Customer', email: 'customer@example.com', whatsapp: '50600000000' },
  boatId: 'boat', tourId: 'tour', tourPackageId: 'pkg', tourDate: '2099-10-01', timeSlotId: 'slot', guests: 4,
  departureLocationId: '00000000-0000-4000-8000-000000000002', paymentMethodKey: 'paypal', extras: [],
  ...overrides,
});
export const termsPayload = (overrides = {}) => ({ termsAccepted: true, termsVersion: 'v1', termsAcceptedVia: 'web', language: 'es', ...overrides });

/**
 * `stage`: 'none' = before any terms migration (to create "historical" bookings), 'additive' = after step 1 only (rollout transition),
 * 'strict' (default) = both migrations, i.e. production's final state.
 */
export async function createBookingDb({ stage = 'strict' } = {}) {
  const db = new PGlite();
  await db.exec('create role service_role; create role authenticated; create role anon; create table profiles(id uuid primary key);');
  const initial = read('202608160001_initial_backend.sql');
  await db.exec(initial.slice(initial.indexOf('create table public.customers'), initial.indexOf('create table public.booking_notifications')));
  const departure = read('202609010001_departure_locations.sql');
  await db.exec(departure.slice(0, departure.indexOf('create trigger departure_locations_set_updated_at')));
  await db.exec(departure.slice(departure.indexOf('alter table public.bookings'), departure.indexOf('alter table public.departure_locations enable')));
  const extras = read('202608160005_extras_catalog.sql');
  await db.exec(extras.slice(0, extras.indexOf('create trigger set_extras_updated_at')));
  await db.exec(`alter table bookings add column if not exists meal_option text;
    create function is_editor_or_admin() returns boolean language sql as $$ select true $$;`);
  await db.exec(read('202610010001_booking_iva.sql'));
  await db.exec(`insert into boats(id,slug,name,included_guests,max_guests) values ('boat','boat','Second Wind',4,10);
    insert into tours(id,title,slug,category) values ('tour','Fishing Tour','tour','Fishing');
    insert into boat_tours(id,boat_id,tour_id) values ('00000000-0000-4000-8000-000000000001','boat','tour');
    insert into tour_packages(id,boat_tour_id,name,package_type,base_price,included_guests,max_guests)
      values ('pkg','00000000-0000-4000-8000-000000000001','Half Day','half-day',700,4,10);
    insert into time_slots(id,label,starts_at) values ('slot','Morning','07:00'),('slot2','Afternoon','13:30'),('slot3','Evening','17:00');
    insert into payment_methods(key,name,type) values ('paypal','PayPal','paypal');
    insert into departure_locations(id,name,slug) values ('00000000-0000-4000-8000-000000000002','Dock','dock');`);
  if (stage !== 'none') await db.exec(TERMS_MIGRATION);
  if (stage === 'strict') await db.exec(REQUIRE_TERMS_MIGRATION);
  const create = async (payload) => (await db.query('select create_booking_transaction($1::jsonb) as booking', [JSON.stringify(payload)])).rows[0].booking;
  return { db, create };
}
