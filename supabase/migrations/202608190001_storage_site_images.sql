-- Supabase Storage replaces Cloudflare Images for admin-managed images.
-- Bucket: site-images (public, 10 MB, jpeg/png/webp only)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read access to the bucket metadata so anon clients can resolve public URLs.
drop policy if exists "site_images_bucket_public_select" on storage.buckets;
create policy "site_images_bucket_public_select"
  on storage.buckets for select to anon, authenticated
  using (id = 'site-images');

-- RLS on storage.objects, strictly scoped to the site-images bucket.
-- Anonymous users may read (bucket is public) but never write.
-- Viewers cannot write. Only admin/editor profiles can insert, update or delete objects.
-- (RLS on storage.objects is already enabled by the storage schema init.)

drop policy if exists "site_images_public_select" on storage.objects;
create policy "site_images_public_select"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-images');

drop policy if exists "site_images_editor_insert" on storage.objects;
create policy "site_images_editor_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'site-images' and public.is_editor_or_admin());

drop policy if exists "site_images_editor_update" on storage.objects;
create policy "site_images_editor_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'site-images' and public.is_editor_or_admin())
  with check (bucket_id = 'site-images' and public.is_editor_or_admin());

drop policy if exists "site_images_editor_delete" on storage.objects;
create policy "site_images_editor_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'site-images' and public.is_editor_or_admin());

-- Extend media_assets with Supabase Storage metadata. Existing columns
-- (provider, provider_id, url, byte_size) are kept for compatibility:
-- provider_id stores the storage_path for storage assets.
alter table public.media_assets
  add column storage_bucket text,
  add column storage_path text,
  add column public_url text,
  add column original_filename text,
  add column size_bytes bigint,
  add column uploaded_by uuid references public.profiles(id);

alter table public.media_assets
  add constraint media_assets_size_bytes_positive
    check (size_bytes is null or size_bytes > 0),
  add constraint media_assets_width_positive
    check (width is null or width > 0),
  add constraint media_assets_height_positive
    check (height is null or height > 0),
  add constraint media_assets_mime_type_allowed
    check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  add constraint media_assets_storage_path_folder
    check (
      storage_path is null
      or storage_path ~ '^(boats|tours|gallery|destinations|reviews|general)/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.[a-z0-9]+$'
    );

create unique index media_assets_storage_path_key
  on public.media_assets (storage_path)
  where storage_path is not null;

create index media_assets_resource_idx
  on public.media_assets (resource_table, resource_id)
  where resource_table is not null;

create index media_assets_uploaded_by_idx
  on public.media_assets (uploaded_by)
  where uploaded_by is not null;

comment on column public.media_assets.provider is 'Image provider: cloudflare_images (legacy) or supabase_storage.';
comment on column public.media_assets.provider_id is 'Provider identifier. For supabase_storage assets this stores the storage_path.';