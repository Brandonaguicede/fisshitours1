alter table public.media_assets
  add column if not exists active boolean not null default true,
  add column if not exists pending_deletion boolean not null default false,
  add column if not exists deletion_error text,
  add column if not exists deletion_attempts int not null default 0,
  add column if not exists deleted_at timestamptz;

alter table public.media_assets
  add constraint media_assets_deletion_attempts_nonnegative
    check (deletion_attempts >= 0);

create index if not exists media_assets_pending_deletion_idx
  on public.media_assets (pending_deletion, created_at)
  where pending_deletion = true;

comment on column public.media_assets.pending_deletion is 'True when a storage object should be retried for safe cleanup.';
comment on column public.media_assets.deletion_error is 'Sanitized last cleanup failure message.';

insert into public.site_settings (key, value, type, active)
values ('home.hero.image', '/images/placeholder-image.jpg', 'image', true)
on conflict (key) do nothing;
