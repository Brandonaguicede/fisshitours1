import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync('supabase/migrations/202610010001_booking_iva.sql', 'utf8');
test('authoritative SQL IVA, decimal rounding, persisted totals, edits and historical bookings', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table bookings(id text primary key, base_price_snapshot numeric(10,2),
      extra_guests_total_snapshot numeric(10,2) default 0, extras_total_snapshot numeric(10,2) default 0,
      departure_surcharge_snapshot numeric(10,2) default 0, total_snapshot numeric(10,2), time_slot_id text);
      insert into bookings(id,base_price_snapshot,total_snapshot) values ('historical',700,700);`);
    await db.exec(migration.split('create or replace function public.create_booking_transaction')[0]);
    for (const [base,tax,total] of [[700,91,791],[850,110.50,960.50],[0.50,0.07,0.57],[10.05,1.31,11.36]]) {
      const { rows } = await db.query('select calculate_booking_iva($1::numeric) as price',[base]);
      assert.deepEqual(rows[0].price,{base_amount:base,tax_rate:0.13,tax_amount:tax,total_amount:total});
      await db.query('insert into bookings(id,base_price_snapshot,total_snapshot) values ($1,$2,$2)',[String(base),base]);
      const saved = (await db.query('select * from bookings where id=$1',[String(base)])).rows[0];
      assert.equal(Number(saved.tax_amount_snapshot),tax);
      assert.equal(Number(saved.total_snapshot),total);
      assert.equal(Number(saved.subtotal_snapshot),base);
    }
    await db.exec("update bookings set base_price_snapshot=850, total_snapshot=850 where id='700'");
    assert.equal(Number((await db.query("select total_snapshot from bookings where id='700'")).rows[0].total_snapshot),960.50);
    await db.exec("update bookings set time_slot_id='new-slot' where id='850'");
    assert.equal(Number((await db.query("select total_snapshot from bookings where id='850'")).rows[0].total_snapshot),960.50);
    const historical=(await db.query("select * from bookings where id='historical'")).rows[0];
    assert.equal(Number(historical.total_snapshot),700);
    assert.equal(Number(historical.tax_rate_snapshot),0);
    await db.exec("insert into bookings(id,base_price_snapshot,extra_guests_total_snapshot,extras_total_snapshot,departure_surcharge_snapshot,total_snapshot) values ('extras',700,50,25,25,800)");
    const extras=(await db.query("select * from bookings where id='extras'")).rows[0];
    assert.equal(Number(extras.subtotal_snapshot),800);
    assert.equal(Number(extras.tax_amount_snapshot),104);
    assert.equal(Number(extras.total_snapshot),904);
  } finally { await db.close(); }
});

test('PayPal order sends persisted total with subtotal and IVA breakdown', async () => {
  for (const [subtotal,tax,total] of [[700,91,791],[850,110.5,960.5]]) {
    const booking={id:'booking',booking_reference:'PFT-TEST',subtotal_snapshot:subtotal,tax_amount_snapshot:tax,
      total_snapshot:total,currency:'USD',payment_method_key:'paypal',booking_status:'pending_payment',payment_status:'pending'};
    let handler, body, payment;
    const query={select(){return this;},eq(){return this;},single:async()=>({data:booking,error:null})};
    const supabase={from:()=>query,rpc:async(name,args)=>{assert.equal(name,'mark_paypal_order_created');payment=args;return {error:null};}};
    const context=vm.createContext({ z, Response, console, crypto:globalThis.crypto,
      Deno:{env:{get:key=>({SUPABASE_URL:'test',SUPABASE_SERVICE_ROLE_KEY:'test'})[key]}},
      createClient:()=>supabase, serve:fn=>{handler=fn;},withCors:fn=>fn,corsHeaders:()=>({}),
      areExternalProviderMocksAllowed:()=>true,
      fetch:async()=>{throw Error('unexpected network');} });
    const source=fs.readFileSync('supabase/functions/paypal-create-order/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
    vm.runInContext(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}),context);
    context.fetchWithTimeout=async(_url,init)=>{body=JSON.parse(init.body);return Response.json({id:'order'});};
    const response=await handler({method:'POST',json:async()=>({bookingId:'00000000-0000-4000-8000-000000000001'})});
    assert.equal(response.status,200);
    const amount=body.purchase_units[0].amount;
    assert.equal(amount.value,total.toFixed(2));
    assert.equal(amount.breakdown.item_total.value,subtotal.toFixed(2));
    assert.equal(amount.breakdown.tax_total.value,tax.toFixed(2));
    assert.equal(payment.p_amount,total.toFixed(2));
    assert.equal((await response.json()).amount,total.toFixed(2));
  }
});

test('real creation and admin-edit RPCs persist and return the same taxed total', async () => {
  const db = new PGlite();
  const read = name => fs.readFileSync('supabase/migrations/' + name,'utf8');
  try {
    await db.exec('create role service_role; create role authenticated; create role anon; create table profiles(id uuid primary key);');
    const initial = read('202608160001_initial_backend.sql');
    await db.exec(initial.slice(initial.indexOf('create table public.customers'),initial.indexOf('create table public.booking_notifications')));
    const departure = read('202609010001_departure_locations.sql');
    await db.exec(departure.slice(0,departure.indexOf('create trigger departure_locations_set_updated_at')));
    await db.exec(departure.slice(departure.indexOf('alter table public.bookings'),departure.indexOf('alter table public.departure_locations enable')));
    const extras = read('202608160005_extras_catalog.sql');
    await db.exec(extras.slice(0,extras.indexOf('create trigger set_extras_updated_at')));
    await db.exec(`alter table bookings add column if not exists meal_option text;
      create function is_editor_or_admin() returns boolean language sql as $$ select true $$;`);
    await db.exec(migration);
    await db.exec(read('202609020004_fix_paypal_attempt_statuses.sql').split('create or replace function public.mark_paypal_payment_unsuccessful')[0]);
    // Test the current audited edit RPC without changing its production behavior.
    await db.exec(`create schema auth;
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      create table booking_changes(booking_id uuid, changed_by uuid, reason text, changes jsonb);`);
    const currentEdits = read('202609260002_booking_edit_audit.sql');
    const editStart = currentEdits.indexOf('create or replace function public.update_booking_details(');
    const editEnd = currentEdits.indexOf('\n$$;', editStart) + 4;
    assert.ok(editStart >= 0 && editEnd > editStart);
    await db.exec(currentEdits.slice(editStart, editEnd));
    await db.exec(`insert into boats(id,slug,name,included_guests,max_guests) values ('boat','boat','Second Wind',4,10);
      insert into tours(id,title,slug,category) values ('tour','Fishing Tour','tour','Fishing');
      insert into boat_tours(id,boat_id,tour_id) values ('00000000-0000-4000-8000-000000000001','boat','tour');
      insert into tour_packages(id,boat_tour_id,name,package_type,base_price,included_guests,max_guests)
        values ('pkg','00000000-0000-4000-8000-000000000001','Half Day','half-day',700,4,10);
      insert into time_slots(id,label,starts_at) values ('slot','Morning','07:00'),('new-slot','Afternoon','13:30');
      insert into payment_methods(key,name,type) values ('paypal','PayPal','paypal');
      insert into departure_locations(id,name,slug) values ('00000000-0000-4000-8000-000000000002','Dock','dock');`);
    const payload={customer:{fullName:'Customer',email:'customer@example.com',whatsapp:'50600000000'},
      boatId:'boat',tourId:'tour',tourPackageId:'pkg',tourDate:'2099-10-01',timeSlotId:'slot',guests:4,
      departureLocationId:'00000000-0000-4000-8000-000000000002',paymentMethodKey:'paypal',extras:[],reason:'Customer requested new departure'};
    // The real pricing Edge Function delegates IVA to the same SQL helper.
    let quoteHandler;
    const pkg=(await db.query("select * from tour_packages where id='pkg'")).rows[0];
    pkg.boat_tours={boat_id:'boat',tour_id:'tour',active:true,boats:{active:true,max_guests:10}};
    const query={select(){return this;},eq(){return this;},single:async()=>({data:pkg,error:null})};
    const quoteClient={from:()=>query,rpc:async(name,args)=>{
      assert.equal(name,'calculate_booking_iva');
      const price=(await db.query('select calculate_booking_iva($1::numeric) as price',[args.p_base_amount])).rows[0].price;
      return {data:price,error:null};
    }};
    const quoteContext=vm.createContext({z,Response,console,Deno:{env:{get:()=> 'test'}},
      createClient:()=>quoteClient,serve:fn=>{quoteHandler=fn;},withCors:fn=>fn,corsHeaders:()=>({})});
    const quoteSource=fs.readFileSync('supabase/functions/calculate-booking-price/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
    vm.runInContext(ts.transpile(quoteSource,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}),quoteContext);
    const quoteResponse=await quoteHandler({method:'POST',json:async()=>({boatId:'boat',tourId:'tour',tourPackageId:'pkg',guests:4})});
    assert.equal(quoteResponse.status,200);
    const quote=await quoteResponse.json();
    assert.equal(quote.base_price,700);
    assert.equal(quote.tax_amount,91);
    assert.equal(quote.total,791);
    const result=(await db.query('select create_booking_transaction($1::jsonb) as booking',[JSON.stringify(payload)])).rows[0].booking;
    assert.equal(result.base_price_snapshot,700);
    assert.equal(result.tax_amount_snapshot,91);
    assert.equal(result.total_snapshot,791);
    const stored=(await db.query('select * from bookings where id=$1',[result.booking_id])).rows[0];
    assert.equal(Number(stored.total_snapshot),result.total_snapshot);
    await db.query('select update_booking_details($1::jsonb)',[JSON.stringify({...payload,bookingId:result.booking_id,timeSlotId:'new-slot'})]);
    const edited=(await db.query('select * from bookings where id=$1',[result.booking_id])).rows[0];
    assert.equal(edited.time_slot_id,'new-slot');
    assert.equal(Number(edited.total_snapshot),791);
    assert.equal(Number(edited.extras_total_snapshot),0);
    await db.exec('update tour_packages set base_price=850');
    await db.query('select update_booking_details($1::jsonb)',[JSON.stringify({...payload,bookingId:result.booking_id,timeSlotId:'new-slot'})]);
    const repriced=(await db.query('select * from bookings where id=$1',[result.booking_id])).rows[0];
    assert.equal(Number(repriced.tax_amount_snapshot),110.50);
    assert.equal(Number(repriced.total_snapshot),960.50);
    // Both capture and webhook use this same amount-validation RPC.
    await assert.rejects(() => db.query("select mark_paypal_payment_paid($1,'order','capture',850,'USD','{}')",[result.booking_id]), /paypal amount does not match booking total/);
    await db.query("select mark_paypal_payment_paid($1,'order','capture',960.50,'USD','{}')",[result.booking_id]);
    const payment=(await db.query('select amount from payments where booking_id=$1',[result.booking_id])).rows[0];
    assert.equal(Number(payment.amount),960.50);
    const listing=(await db.query('select list_admin_bookings() as result')).rows[0].result;
    assert.equal(listing.rows[0].base_price_snapshot,850);
    assert.equal(listing.rows[0].tax_amount_snapshot,110.5);
    assert.equal(listing.rows[0].total_snapshot,960.5);
  } finally { await db.close(); }
});
