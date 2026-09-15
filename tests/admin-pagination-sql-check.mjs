import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/202609150001_admin_booking_pagination.sql','utf8');
let body=migration.match(/  return \(([\s\S]*?)\n  \);/)[1];
for(const table of ['bookings','customers','boats','tours','time_slots'])body=body.replaceAll(`public.${table}`,`fixture_${table}`);
function query(offset,search='',status='all',payment='all',date=null){
 const values={p_search:`'${search.replaceAll("'","''")}'`,p_booking_status:`'${status}'`,p_payment_status:`'${payment}'`,p_tour_date:date?`'${date}'::date`:'null::date',p_offset:String(offset),p_limit:'10'};
 return body.replace(/\bp_(search|booking_status|payment_status|tour_date|offset|limit)\b/g,key=>values[key]);
}
const probes=[['first',query(0)],['second',query(10)],['last',query(70)],['search',query(0,'PFT-001')],['literal',query(0,"%_'\",()")],['pending',query(0,'','pending_payment')],['paid',query(0,'','all','paid')],['date',query(0,'','all','all','2026-09-16')],['customer',query(0,'correo.largo@example.com')],['boat',query(0,'Second Wind')]];
fs.writeFileSync('tmp/admin-fixture-pagination-check.sql',`with fixture_bookings as (
 select 'booking-'||i::text as id,'customer-1'::text as customer_id,'boat-1'::text as boat_id,'tour-1'::text as tour_id,'package-1'::text as tour_package_id,'time-1'::text as time_slot_id,
 ''::text as special_requests,'PFT-'||lpad(i::text,3,'0') as booking_reference,case when i<=50 then '2026-09-16'::date else '2026-09-17'::date end as tour_date,2 as guests,350::numeric as total_snapshot,
 'Playas del Coco'::text as departure_location_name_snapshot,0::numeric as departure_surcharge_snapshot,
 case when i%3=0 then 'paypal' else 'whatsapp-link' end as payment_method_key,
 case when i%3=0 then 'paid' else 'pending' end as payment_status,case when i%3=0 then 'confirmed' else 'pending_payment' end as booking_status,
 '2026-09-15 08:00:00+00'::timestamptz as created_at
 from generate_series(1,76) i
),fixture_customers as (select 'customer-1'::text as id,'Cliente'::text as full_name,'correo.largo@example.com'::text as email,'0000000'::text as whatsapp),
fixture_boats as (select 'boat-1'::text as id,'Second Wind'::text as name),
fixture_tours as (select 'tour-1'::text as id,'Fishing Tour'::text as title),
fixture_time_slots as (select 'time-1'::text as id,'7:00 AM'::text as label)
${probes.map(([name,q])=>`select '${name}' as probe,(result->>'total')::integer as total,jsonb_array_length(result->'rows') as page_rows,result->'rows'->0->>'booking_reference' as first_reference from (select (${q}) as result) x`).join('\nunion all\n')};
`);
