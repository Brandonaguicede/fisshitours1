create table if not exists public.tour_locations (
  id uuid primary key default gen_random_uuid(),
  tour_id text not null references public.tours(id) on delete cascade,
  location text not null check (length(trim(location)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tour_locations_tour_location_unique
  on public.tour_locations (tour_id, lower(trim(location)));
create index if not exists tour_locations_tour_sort_idx
  on public.tour_locations (tour_id, sort_order);

insert into public.tour_locations (tour_id, location, sort_order)
select id, trim(location), 0
from public.tours
where location is not null and length(trim(location)) > 0
on conflict do nothing;

drop trigger if exists set_tour_locations_updated_at on public.tour_locations;
create trigger set_tour_locations_updated_at
before update on public.tour_locations
for each row execute function public.set_updated_at();

alter table public.tour_locations enable row level security;

create policy "Public can read tour locations"
on public.tour_locations for select
using (true);

create policy "Authenticated users manage tour locations"
on public.tour_locations for all
to authenticated
using (true)
with check (true);

grant select on public.tour_locations to anon, authenticated;
grant insert, update, delete on public.tour_locations to authenticated;
