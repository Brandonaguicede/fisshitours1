insert into public.time_slots (id, label, starts_at, active, sort_order)
values
  ('morning', 'Morning', '07:00', true, 1),
  ('midday', 'Midday', '11:30', true, 2),
  ('afternoon', 'Afternoon', '15:30', true, 3),
  ('evening', 'Evening', '18:30', true, 4)
on conflict (id) do update set
  label = excluded.label,
  starts_at = excluded.starts_at,
  active = excluded.active,
  sort_order = excluded.sort_order;
