alter table public.tours
  add column if not exists publication_status text not null default 'published'
    check (publication_status in ('draft', 'published', 'inactive')),
  add column if not exists featured boolean not null default false,
  add column if not exists image_alt text;

update public.tours
  set publication_status = case when active then 'published' else 'inactive' end
  where publication_status is null or publication_status = 'published';

create or replace function public.sync_tour_active_from_publication_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.active = new.publication_status = 'published';
  return new;
end;
$$;

drop trigger if exists tours_sync_publication_status on public.tours;
create trigger tours_sync_publication_status
before insert or update of publication_status
on public.tours
for each row
execute function public.sync_tour_active_from_publication_status();

create table if not exists public.tour_images (
  id uuid primary key default gen_random_uuid(),
  tour_id text not null references public.tours(id) on delete cascade,
  image_url text not null,
  storage_path text,
  alt_text text not null default '',
  is_primary boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  pending_deletion boolean not null default false,
  deletion_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tour_images_tour_active_order_idx
  on public.tour_images (tour_id, active, sort_order);

create unique index if not exists tour_images_one_primary_per_tour
  on public.tour_images (tour_id)
  where is_primary = true and active = true;

create table if not exists public.tour_inclusions (
  id uuid primary key default gen_random_uuid(),
  tour_id text not null references public.tours(id) on delete cascade,
  tour_package_id text references public.tour_packages(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(label)) > 0)
);

create index if not exists tour_inclusions_tour_package_order_idx
  on public.tour_inclusions (tour_id, tour_package_id, active, sort_order);

create trigger tour_images_set_updated_at
  before update on public.tour_images
  for each row execute function public.set_updated_at();

create trigger tour_inclusions_set_updated_at
  before update on public.tour_inclusions
  for each row execute function public.set_updated_at();

alter table public.tour_images enable row level security;
alter table public.tour_inclusions enable row level security;

drop policy if exists "public read active tour images" on public.tour_images;
create policy "public read active tour images"
  on public.tour_images for select to anon, authenticated
  using (active = true);

drop policy if exists "public read active tour inclusions" on public.tour_inclusions;
create policy "public read active tour inclusions"
  on public.tour_inclusions for select to anon, authenticated
  using (active = true);

drop policy if exists "editor manage tour images" on public.tour_images;
create policy "editor manage tour images"
  on public.tour_images for all to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists "editor manage tour inclusions" on public.tour_inclusions;
create policy "editor manage tour inclusions"
  on public.tour_inclusions for all to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

grant select on table public.tour_images, public.tour_inclusions to anon, authenticated;
grant insert, update, delete on table public.tour_images, public.tour_inclusions to authenticated;
