-- Only replace the original measured clip; preserve any video changed by the admin.
-- Apply after the versioned MP4 and poster files have been deployed.
do $$
declare
  original_url text := 'https://pub-1565398a11364fafa0f16b5f55442375.r2.dev/videos%20papagayo%20hero/Timeline%201(53).mov';
begin
  if exists (select 1 from public.site_settings where key='home.hero.video' and replace(value,' ','%20')=original_url) then
    update public.site_settings set value='/videos/hero-papagayo-desktop-v1.mp4', updated_at=now() where key='home.hero.video';
    insert into public.site_settings(key,value,type,active) values ('home.hero.mobile_video','/videos/hero-papagayo-mobile-v1.mp4','video',true)
      on conflict(key) do update set value=excluded.value, updated_at=now()
      where btrim(site_settings.value)='' or replace(site_settings.value,' ','%20')=original_url;
    insert into public.site_settings(key,value,type,active) values ('home.hero.video_poster','/images/hero-papagayo-poster-v1.webp','image',true)
      on conflict(key) do update set value=excluded.value, updated_at=now()
      where btrim(site_settings.value)='';
  end if;
end;
$$;
