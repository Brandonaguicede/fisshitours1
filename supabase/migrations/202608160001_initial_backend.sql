create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  whatsapp text not null,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.boats (
  id text primary key,
  slug text not null unique,
  name text not null,
  image_url text,
  image_public_id text,
  images jsonb not null default '[]'::jsonb,
  badge text,
  base_price_label text,
  length text,
  engine text,
  included_guests int not null check (included_guests >= 0),
  max_guests int not null check (max_guests > 0),
  extra_guest_price numeric(10,2) not null default 0 check (extra_guest_price >= 0),
  featured_spec text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_guests >= included_guests)
);

create table public.tours (
  id text primary key,
  title text not null,
  slug text not null unique,
  location text,
  description text,
  long_description text,
  image_url text,
  image_public_id text,
  category text not null,
  rating numeric(3,2) not null default 5 check (rating >= 0 and rating <= 5),
  highlights jsonb not null default '[]'::jsonb,
  included jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.boat_tours (
  id uuid primary key default gen_random_uuid(),
  boat_id text not null references public.boats(id) on delete cascade,
  tour_id text not null references public.tours(id) on delete cascade,
  active boolean not null default true,
  sort_order int not null default 0,
  unique (boat_id, tour_id)
);

create table public.tour_packages (
  id text primary key,
  boat_tour_id uuid not null references public.boat_tours(id) on delete cascade,
  name text not null,
  package_type text not null,
  description text,
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  base_price numeric(10,2) not null default 0 check (base_price >= 0),
  included_guests int not null default 0 check (included_guests >= 0),
  max_guests int not null check (max_guests > 0),
  extra_guest_price numeric(10,2) not null default 0 check (extra_guest_price >= 0),
  custom_quote boolean not null default false,
  image_url text,
  image_public_id text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_guests >= included_guests)
);

create table public.time_slots (
  id text primary key,
  label text not null,
  starts_at time not null,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  type text not null check (type in ('paypal', 'whatsapp_link', 'pay_on_day', 'bank_transfer', 'sinpe', 'cash', 'manual')),
  active boolean not null default true,
  instructions text,
  logo_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique,
  customer_id uuid not null references public.customers(id),
  boat_id text not null references public.boats(id),
  tour_id text not null references public.tours(id),
  boat_tour_id uuid not null references public.boat_tours(id),
  tour_package_id text not null references public.tour_packages(id),
  tour_date date not null,
  time_slot_id text not null references public.time_slots(id),
  guests int not null check (guests > 0),
  meal_option text,
  special_requests text,
  payment_method_key text not null references public.payment_methods(key),
  payment_status text not null check (payment_status in ('pending', 'processing', 'paid', 'failed', 'refunded', 'not_required_yet')),
  booking_status text not null check (booking_status in ('pending', 'pending_payment', 'pending_confirmation', 'confirmed', 'cancelled', 'completed')),
  currency text not null default 'USD',
  base_price_snapshot numeric(10,2) not null check (base_price_snapshot >= 0),
  included_guests_snapshot int not null check (included_guests_snapshot >= 0),
  max_guests_snapshot int not null check (max_guests_snapshot > 0),
  extra_guest_price_snapshot numeric(10,2) not null check (extra_guest_price_snapshot >= 0),
  extra_guests_snapshot int not null default 0 check (extra_guests_snapshot >= 0),
  extra_guests_total_snapshot numeric(10,2) not null default 0 check (extra_guests_total_snapshot >= 0),
  extras_total_snapshot numeric(10,2) not null default 0 check (extras_total_snapshot >= 0),
  total_snapshot numeric(10,2) not null check (total_snapshot >= 0),
  paypal_order_id text,
  expires_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_guests_snapshot >= included_guests_snapshot),
  check (guests <= max_guests_snapshot)
);

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  boat_id text not null references public.boats(id) on delete cascade,
  tour_date date not null,
  time_slot_id text not null references public.time_slots(id),
  reason text,
  source text not null check (source in ('manual', 'booking', 'maintenance', 'weather')),
  booking_id uuid references public.bookings(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index availability_blocks_one_active_slot
  on public.availability_blocks (boat_id, tour_date, time_slot_id)
  where active = true;

create table public.booking_extras (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  key text not null,
  label text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  total numeric(10,2) not null check (total >= 0),
  created_at timestamptz not null default now()
);

create table public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  previous_booking_status text,
  new_booking_status text not null,
  previous_payment_status text,
  new_payment_status text not null,
  changed_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider text not null check (provider in ('paypal', 'manual', 'whatsapp')),
  provider_order_id text,
  provider_capture_id text,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'USD',
  status text not null check (status in ('pending', 'processing', 'paid', 'failed', 'refunded')),
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.booking_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  type text not null check (type in ('whatsapp_confirmation', 'download_receipt', 'email', 'admin_note')),
  channel text not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  quote text not null,
  rating int not null check (rating between 1 and 5),
  tour_id text references public.tours(id),
  boat_id text references public.boats(id),
  image_url text,
  image_public_id text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gallery_images (
  id text primary key,
  src text,
  image_url text,
  image_public_id text,
  alt text not null,
  category text not null,
  title text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.destinations (
  id text primary key,
  name text not null,
  region text,
  image_url text,
  image_public_id text,
  description text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.editable_content (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  locale text not null check (locale in ('es', 'en')),
  type text not null check (type in ('text', 'textarea', 'rich_text', 'number', 'price', 'image', 'url', 'boolean', 'json')),
  value text not null,
  group_name text not null,
  label text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, locale)
);

create table public.site_settings (
  key text primary key,
  value text not null,
  type text not null default 'text',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'cloudflare_images',
  provider_id text not null unique,
  url text not null,
  mime_type text,
  byte_size int,
  width int,
  height int,
  resource_table text,
  resource_id text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_table text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger boats_set_updated_at before update on public.boats for each row execute function public.set_updated_at();
create trigger tours_set_updated_at before update on public.tours for each row execute function public.set_updated_at();
create trigger tour_packages_set_updated_at before update on public.tour_packages for each row execute function public.set_updated_at();
create trigger payment_methods_set_updated_at before update on public.payment_methods for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger reviews_set_updated_at before update on public.reviews for each row execute function public.set_updated_at();
create trigger gallery_images_set_updated_at before update on public.gallery_images for each row execute function public.set_updated_at();
create trigger destinations_set_updated_at before update on public.destinations for each row execute function public.set_updated_at();
create trigger editable_content_set_updated_at before update on public.editable_content for each row execute function public.set_updated_at();
create trigger site_settings_set_updated_at before update on public.site_settings for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role = 'admin'
  );
$$;

create or replace function public.is_editor_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role in ('admin', 'editor')
  );
$$;

create or replace function public.is_admin_editor_viewer()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role in ('admin', 'editor', 'viewer')
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_editor_or_admin() from public;
revoke all on function public.is_admin_editor_viewer() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_editor_or_admin() to authenticated;
grant execute on function public.is_admin_editor_viewer() to authenticated;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.boats enable row level security;
alter table public.tours enable row level security;
alter table public.boat_tours enable row level security;
alter table public.tour_packages enable row level security;
alter table public.time_slots enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_extras enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payments enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.booking_notifications enable row level security;
alter table public.reviews enable row level security;
alter table public.gallery_images enable row level security;
alter table public.destinations enable row level security;
alter table public.editable_content enable row level security;
alter table public.site_settings enable row level security;
alter table public.media_assets enable row level security;
alter table public.audit_log enable row level security;

create policy "public read active boats" on public.boats for select to anon, authenticated using (active = true);
create policy "public read active tours" on public.tours for select to anon, authenticated using (active = true);
create policy "public read active boat tours" on public.boat_tours for select to anon, authenticated using (active = true);
create policy "public read active tour packages" on public.tour_packages for select to anon, authenticated using (active = true);
create policy "public read active time slots" on public.time_slots for select to anon, authenticated using (active = true);
create policy "public read approved reviews" on public.reviews for select to anon, authenticated using (status = 'approved');
create policy "public read active gallery" on public.gallery_images for select to anon, authenticated using (active = true);
create policy "public read active destinations" on public.destinations for select to anon, authenticated using (active = true);
create policy "public read active payment methods" on public.payment_methods for select to anon, authenticated using (active = true);
create policy "public read active content" on public.editable_content for select to anon, authenticated using (active = true);
create policy "public read active site settings" on public.site_settings for select to anon, authenticated using (active = true);

create policy "admin read profiles" on public.profiles for select to authenticated using (public.is_admin());
create policy "admin insert profiles" on public.profiles for insert to authenticated with check (public.is_admin());
create policy "admin update profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete profiles" on public.profiles for delete to authenticated using (public.is_admin());

create policy "staff read customers" on public.customers for select to authenticated using (public.is_admin_editor_viewer());
create policy "staff read bookings" on public.bookings for select to authenticated using (public.is_admin_editor_viewer());
create policy "staff read booking extras" on public.booking_extras for select to authenticated using (public.is_admin_editor_viewer());
create policy "staff read booking history" on public.booking_status_history for select to authenticated using (public.is_admin_editor_viewer());
create policy "staff read booking notifications" on public.booking_notifications for select to authenticated using (public.is_admin_editor_viewer());
create policy "staff read payments" on public.payments for select to authenticated using (public.is_admin_editor_viewer());
create policy "staff read webhook events" on public.payment_webhook_events for select to authenticated using (public.is_admin_editor_viewer());

create policy "editor update bookings" on public.bookings for update to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "admin delete bookings" on public.bookings for delete to authenticated using (public.is_admin());

create policy "editor manage boats" on public.boats for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage tours" on public.tours for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage boat tours" on public.boat_tours for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage tour packages" on public.tour_packages for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage time slots" on public.time_slots for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage availability blocks" on public.availability_blocks for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage gallery" on public.gallery_images for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage destinations" on public.destinations for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage content" on public.editable_content for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage payment methods" on public.payment_methods for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage reviews" on public.reviews for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage media assets" on public.media_assets for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "editor manage site settings" on public.site_settings for all to authenticated using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy "staff read audit log" on public.audit_log for select to authenticated using (public.is_admin_editor_viewer());
