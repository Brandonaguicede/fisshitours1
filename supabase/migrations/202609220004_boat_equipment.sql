-- Boat "Equipamiento" used to be a single comma-separated text column
-- (boats.featured_spec), edited as one big textarea with no per-item
-- structure — no individual add/edit/delete/reorder, and no per-item
-- bilingual fields. This gives it the same structured model as
-- tour_inclusions: one row per item, per boat, with its own label_es/
-- label_en that "Traducir todo el sitio" fills bidirectionally.
--
-- boats.featured_spec (and its _es/_en siblings from the previous
-- migrations) are left in place, untouched — the admin no longer writes to
-- them, but nothing reads them anymore either after this pass's frontend
-- changes, so there's no need for a destructive column drop right now.
create table if not exists public.boat_equipment (
  id uuid primary key default gen_random_uuid(),
  boat_id text not null references public.boats(id) on delete cascade,
  label text not null,
  label_es text,
  label_en text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(label)) > 0)
);

create index if not exists boat_equipment_boat_order_idx
  on public.boat_equipment (boat_id, active, sort_order);

create trigger boat_equipment_set_updated_at
  before update on public.boat_equipment
  for each row execute function public.set_updated_at();

alter table public.boat_equipment enable row level security;

create policy "public read active boat equipment"
  on public.boat_equipment for select to anon, authenticated
  using (active = true);

create policy "editor manage boat equipment"
  on public.boat_equipment for all to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

grant select on table public.boat_equipment to anon, authenticated;
grant insert, update, delete on table public.boat_equipment to authenticated;
-- Learned from tour_inclusions' gap (202609220002): grant service_role
-- explicitly, up front — it's the only role translate-all-site-content
-- (this table's one service-role consumer) ever connects as, and without
-- this grant it would hit the exact same silent "permission denied for
-- table" that tour_inclusions did.
grant select, insert, update, delete on table public.boat_equipment to service_role;

-- Backfill: split each boat's existing featured_spec into individual rows,
-- preserving order, matching the same "trim + drop a trailing period" rule
-- the admin UI itself already used for that comma-separated field
-- (equipmentTextToItems in AdminBoatsPage.tsx). label_es/label_en are left
-- NULL — "Traducir todo el sitio" fills both from this original text, same
-- as any other brand-new field. Guarded so re-running this migration never
-- duplicates rows for a boat that already has equipment.
insert into public.boat_equipment (boat_id, label, sort_order)
select b.id, regexp_replace(trim(item), '\.$', ''), row_number() over (partition by b.id order by ordinality)
from public.boats b
cross join lateral unnest(string_to_array(b.featured_spec, ',')) with ordinality as item
where b.featured_spec is not null
  and trim(regexp_replace(trim(item), '\.$', '')) <> ''
  and not exists (select 1 from public.boat_equipment be where be.boat_id = b.id);
