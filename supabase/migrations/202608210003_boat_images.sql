create table if not exists public.boat_images (
  id uuid primary key default gen_random_uuid(),
  boat_id text not null references public.boats(id) on delete cascade,
  image_url text not null,
  storage_path text,
  alt_text text not null default '',
  is_primary boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  pending_deletion boolean not null default false,
  deletion_error text,
  deletion_attempts int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists boat_images_one_primary_active
  on public.boat_images (boat_id)
  where is_primary = true and active = true;

create index if not exists boat_images_public_idx
  on public.boat_images (boat_id, active, sort_order);

drop trigger if exists boat_images_set_updated_at on public.boat_images;
create trigger boat_images_set_updated_at
  before update on public.boat_images
  for each row execute function public.set_updated_at();

alter table public.boat_images enable row level security;

drop policy if exists "public read active boat images" on public.boat_images;
create policy "public read active boat images"
  on public.boat_images for select
  to anon, authenticated
  using (active = true);

drop policy if exists "editor manage boat images" on public.boat_images;
create policy "editor manage boat images"
  on public.boat_images for all
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

grant select on public.boat_images to anon, authenticated;
grant insert, update, delete on public.boat_images to authenticated;
grant select, insert, update, delete on public.boat_images to service_role;

insert into public.boat_images (boat_id, image_url, storage_path, alt_text, is_primary, sort_order, active)
select b.id, b.image_url, b.image_public_id, b.name || ' main image', true, 0, true
from public.boats b
where b.image_url is not null
on conflict do nothing;

insert into public.boat_images (boat_id, image_url, storage_path, alt_text, is_primary, sort_order, active)
select b.id, image_value, null, b.name || ' gallery image', false, image_index + 1, true
from public.boats b
cross join lateral jsonb_array_elements_text(b.images) with ordinality as image_list(image_value, image_index)
where coalesce(image_value, '') <> ''
on conflict do nothing;
