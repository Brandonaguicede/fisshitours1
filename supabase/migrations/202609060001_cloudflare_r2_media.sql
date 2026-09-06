-- Media uploads are stored in Cloudflare R2. The bucket name is kept in
-- media_assets so deletion and audit operations can validate ownership.
alter table public.media_assets drop constraint if exists media_assets_mime_type_allowed;
alter table public.media_assets
  add constraint media_assets_mime_type_allowed
  check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'));

comment on column public.media_assets.provider is 'Media provider: cloudflare_r2.';
