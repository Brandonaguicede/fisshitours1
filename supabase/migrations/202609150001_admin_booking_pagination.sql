-- Read-only pagination and literal search across related reservation fields.
-- Invoker permissions preserve the existing RLS policies, including viewer access.
create or replace function public.list_admin_bookings(
  p_search text default '',
  p_booking_status text default 'all',
  p_payment_status text default 'all',
  p_tour_date date default null,
  p_offset integer default 0,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not in (10, 25, 50) then
    raise exception 'Invalid pagination parameters' using errcode = '22023';
  end if;
  return (
    with filtered as (
      select b.id, b.boat_id, b.tour_id, b.tour_package_id, b.time_slot_id,
        b.special_requests, b.booking_reference, b.tour_date, b.guests,
        b.total_snapshot, b.departure_location_name_snapshot, b.departure_surcharge_snapshot,
        b.payment_method_key, b.payment_status, b.booking_status, b.created_at,
        case when c.id is not null then jsonb_build_object('full_name', c.full_name, 'email', c.email, 'whatsapp', c.whatsapp) end as customers,
        case when boat.id is not null then jsonb_build_object('name', boat.name) end as boats,
        case when t.id is not null then jsonb_build_object('title', t.title) end as tours,
        case when slot.id is not null then jsonb_build_object('label', slot.label) end as time_slots
      from public.bookings b
      left join public.customers c on c.id = b.customer_id
      left join public.boats boat on boat.id = b.boat_id
      left join public.tours t on t.id = b.tour_id
      left join public.time_slots slot on slot.id = b.time_slot_id
      where (coalesce(p_booking_status, 'all') = 'all' or b.booking_status = p_booking_status)
        and (coalesce(p_payment_status, 'all') = 'all' or b.payment_status = p_payment_status)
        and (p_tour_date is null or b.tour_date = p_tour_date)
        and (coalesce(p_search, '') = '' or position(lower(p_search) in lower(
          concat_ws(' ', b.booking_reference, c.full_name, c.email, c.whatsapp, boat.name, t.title)
        )) > 0)
    ), paged as (
      select * from filtered order by tour_date asc, created_at desc, id asc
      limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by tour_date asc, created_at desc, id asc) from paged), '[]'::jsonb),
      'total', (select count(*) from filtered)
    )
  );
end;
$$;

revoke all on function public.list_admin_bookings(text, text, text, date, integer, integer) from public, anon;
grant execute on function public.list_admin_bookings(text, text, text, date, integer, integer) to authenticated;

-- Keep gallery category filters complete without downloading every image.
create or replace function public.list_admin_gallery_categories()
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select distinct category from public.gallery_images where category is not null order by category;
$$;
revoke all on function public.list_admin_gallery_categories() from public, anon;
grant execute on function public.list_admin_gallery_categories() to authenticated;
