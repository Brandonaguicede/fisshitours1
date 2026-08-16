create table public.extras (
  id text primary key,
  key text not null unique,
  label text not null,
  description text,
  unit_price numeric not null default 0 check (unit_price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.package_extras (
  id uuid primary key default gen_random_uuid(),
  tour_package_id text not null references public.tour_packages(id) on delete cascade,
  extra_id text not null references public.extras(id) on delete cascade,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tour_package_id, extra_id)
);

create trigger set_extras_updated_at
before update on public.extras
for each row execute function public.set_updated_at();

create trigger set_package_extras_updated_at
before update on public.package_extras
for each row execute function public.set_updated_at();

alter table public.extras enable row level security;
alter table public.package_extras enable row level security;

create policy "Public can read active extras"
on public.extras for select
to anon, authenticated
using (active = true);

create policy "Public can read active package extras"
on public.package_extras for select
to anon, authenticated
using (active = true);

create policy "Editors can manage extras"
on public.extras for all
to authenticated
using (public.is_editor_or_admin())
with check (public.is_editor_or_admin());

create policy "Editors can manage package extras"
on public.package_extras for all
to authenticated
using (public.is_editor_or_admin())
with check (public.is_editor_or_admin());
