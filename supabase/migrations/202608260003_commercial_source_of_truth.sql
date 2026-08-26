-- tour_packages is the single source of truth for commercial terms (price, duration,
-- included guests, extra guest price, max capacity) of a Tour+Boat+Package combination.
-- boats.included_guests / extra_guest_price / base_price_label are retained for backward
-- compatibility only (existing rows keep their historical values) and are no longer read
-- or written by the application for pricing.

alter table public.boats
  alter column included_guests set default 1;

comment on column public.tour_packages.base_price is
  'Source of truth for commercial pricing. Do not duplicate on boats or elsewhere.';
comment on column public.tour_packages.included_guests is
  'Source of truth for included guest count. Do not duplicate on boats or elsewhere.';
comment on column public.tour_packages.extra_guest_price is
  'Source of truth for the additional-guest price. Do not duplicate on boats or elsewhere.';
comment on column public.tour_packages.max_guests is
  'Source of truth for reservable capacity. Cross-checked against boats.max_guests (physical capacity) at booking time.';

comment on column public.boats.included_guests is
  'Deprecated for pricing: retained for backward compatibility only. Use tour_packages.included_guests.';
comment on column public.boats.extra_guest_price is
  'Deprecated for pricing: retained for backward compatibility only. Use tour_packages.extra_guest_price.';
comment on column public.boats.base_price_label is
  'Deprecated: display value should be computed live from tour_packages.base_price (lowest active package price), not stored as free text.';
comment on column public.boats.max_guests is
  'Physical capacity of the boat. Used as an informational spec and safety ceiling; not a pricing default.';

-- boat_tours.active is derived from whether the tour has any active package on that boat,
-- instead of being toggled manually from two different admin screens.
create or replace function public.sync_boat_tour_active_from_packages()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_boat_tour_id uuid;
begin
  target_boat_tour_id := coalesce(new.boat_tour_id, old.boat_tour_id);
  update public.boat_tours
    set active = exists (
      select 1 from public.tour_packages
      where boat_tour_id = target_boat_tour_id and active = true
    )
  where id = target_boat_tour_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tour_packages_sync_boat_tour_active on public.tour_packages;
create trigger tour_packages_sync_boat_tour_active
after insert or delete or update of active, boat_tour_id on public.tour_packages
for each row execute function public.sync_boat_tour_active_from_packages();

-- One-time backfill so existing boat_tours.active reflects real package activity.
update public.boat_tours bt
set active = exists (
  select 1 from public.tour_packages tp
  where tp.boat_tour_id = bt.id and tp.active = true
);
