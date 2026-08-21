alter table public.reviews
  add column if not exists active boolean not null default true,
  add column if not exists sort_order int not null default 0;

create index if not exists reviews_public_order_idx
  on public.reviews (featured desc, sort_order asc, created_at desc)
  where status = 'approved' and active = true;

insert into public.site_settings (key, value, type, active)
values
  ('home.hero.title.es', 'Experimenta el oceano', 'text', true),
  ('home.hero.title.en', 'Experience the Ocean', 'text', true),
  ('home.hero.eyebrow.es', 'Charters privados - Costa Rica', 'text', true),
  ('home.hero.eyebrow.en', 'Private charters - Costa Rica', 'text', true),
  ('home.hero.subtitle.es', 'Pesca de clase mundial, vistas impresionantes y recuerdos inolvidables.', 'textarea', true),
  ('home.hero.subtitle.en', 'World-class fishing, stunning views, and unforgettable memories.', 'textarea', true),
  ('home.hero.primary_label.es', 'Reservar ahora', 'text', true),
  ('home.hero.primary_label.en', 'Book now', 'text', true),
  ('home.hero.primary_href', '#booking', 'url', true),
  ('home.hero.primary_enabled', 'true', 'boolean', true),
  ('home.hero.secondary_label.es', 'Ver tours', 'text', true),
  ('home.hero.secondary_label.en', 'View tours', 'text', true),
  ('home.hero.secondary_href', '#tours', 'url', true),
  ('home.hero.secondary_enabled', 'true', 'boolean', true),
  ('home.hero.image_alt.es', 'Bote privado navegando en el Pacifico de Costa Rica', 'text', true),
  ('home.hero.image_alt.en', 'Private boat sailing Costa Rica Pacific waters', 'text', true)
on conflict (key) do nothing;
