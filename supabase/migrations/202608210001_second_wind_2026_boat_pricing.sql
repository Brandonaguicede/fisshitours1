insert into public.boats (
  id,
  slug,
  name,
  badge,
  base_price_label,
  length,
  engine,
  included_guests,
  max_guests,
  extra_guest_price,
  featured_spec,
  active,
  sort_order
) values (
  'segundo-viento',
  'second-wind',
  'Second Wind',
  'Luxury meets nature',
  'From $600 per boat',
  '32 ft',
  'Yamaha 250HP',
  5,
  10,
  65,
  'Garmin GPS, VHF radio, premium JBL sound, Bluetooth, restroom, water toys, tuna tube, live bait well, safety equipment, liability insurance.',
  true,
  1
) on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  badge = excluded.badge,
  base_price_label = excluded.base_price_label,
  length = excluded.length,
  engine = excluded.engine,
  included_guests = excluded.included_guests,
  max_guests = excluded.max_guests,
  extra_guest_price = excluded.extra_guest_price,
  featured_spec = excluded.featured_spec,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.tours (id, title, slug, category, active, sort_order)
values
('beach-snorkeling', 'Beach & Snorkeling Tour', 'beach-snorkeling-tour', 'Snorkeling & Beach', true, 1),
('fishing', 'Fishing Tour', 'fishing-tour', 'Fishing', true, 2),
('surfing', 'Surfing Tour', 'surfing-tour', 'Surfing', true, 3),
('water-toys', 'Water Toys Tour', 'water-toys-tour', 'Water Toys', true, 4),
('bioluminescence', 'Bioluminescence Tour', 'bioluminescence-tour', 'Bioluminescence', true, 5)
on conflict (id) do update set
  title = excluded.title,
  slug = excluded.slug,
  category = excluded.category,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.boat_tours (id, boat_id, tour_id, active, sort_order)
values
('11111111-1111-4111-8111-111111111111', 'segundo-viento', 'beach-snorkeling', true, 1),
('22222222-2222-4222-8222-222222222222', 'segundo-viento', 'fishing', true, 2),
('33333333-3333-4333-8333-333333333333', 'segundo-viento', 'surfing', true, 3),
('44444444-4444-4444-8444-444444444444', 'segundo-viento', 'water-toys', true, 4),
('55555555-5555-4555-8555-555555555555', 'segundo-viento', 'bioluminescence', true, 5)
on conflict (boat_id, tour_id) do update set
  active = excluded.active,
  sort_order = excluded.sort_order;

insert into public.tour_packages (
  id,
  boat_tour_id,
  name,
  package_type,
  description,
  duration_minutes,
  base_price,
  included_guests,
  max_guests,
  extra_guest_price,
  custom_quote,
  image_url,
  active,
  sort_order
) values
('second-wind-beach-snorkeling-half', '11111111-1111-4111-8111-111111111111', 'Beach & Snorkeling Tour - Half Day', 'half_day', 'Private boat rental for Beach & Snorkeling, Half Day.', 240, 650, 5, 10, 65, false, '/galeria/867a2f50-e306-448d-bfd2-b082160e6dd8.jpeg', true, 1),
('second-wind-beach-snorkeling-three-quarter', '11111111-1111-4111-8111-111111111111', 'Beach & Snorkeling Tour - 3/4 Day', 'three_quarter_day', 'Private boat rental for Beach & Snorkeling, 3/4 Day.', 360, 750, 5, 10, 65, false, '/galeria/867a2f50-e306-448d-bfd2-b082160e6dd8.jpeg', true, 2),
('second-wind-beach-snorkeling-full', '11111111-1111-4111-8111-111111111111', 'Beach & Snorkeling Tour - Full Day', 'full_day', 'Private boat rental for Beach & Snorkeling, Full Day with lunch where applicable.', 480, 950, 5, 10, 65, false, '/galeria/867a2f50-e306-448d-b082160e6dd8.jpeg', true, 3),
('second-wind-fishing-half', '22222222-2222-4222-8222-222222222222', 'Fishing Tour - Half Day', 'half_day', 'Private boat rental for Fishing, Half Day.', 240, 700, 5, 10, 65, false, '/a95baf49-2fa7-4c9a-ab8e-57cffc5c74b6.jpeg', true, 4),
('second-wind-fishing-three-quarter', '22222222-2222-4222-8222-222222222222', 'Fishing Tour - 3/4 Day', 'three_quarter_day', 'Private boat rental for Fishing, 3/4 Day.', 360, 850, 5, 10, 65, false, '/a95baf49-2fa7-4c9a-ab8e-57cffc5c74b6.jpeg', true, 5),
('second-wind-fishing-full', '22222222-2222-4222-8222-222222222222', 'Fishing Tour - Full Day', 'full_day', 'Private boat rental for Fishing, Full Day with lunch where applicable.', 480, 1050, 5, 10, 65, false, '/a95baf49-2fa7-4c9a-ab8e-57cffc5c74b6.jpeg', true, 6),
('second-wind-surfing-half', '33333333-3333-4333-8333-333333333333', 'Surfing Tour - Half Day', 'half_day', 'Private boat rental for Surfing, Half Day.', 240, 600, 5, 10, 65, false, '/galeria/IMG_1088.jpeg', true, 7),
('second-wind-surfing-three-quarter', '33333333-3333-4333-8333-333333333333', 'Surfing Tour - 3/4 Day', 'three_quarter_day', 'Private boat rental for Surfing, 3/4 Day.', 360, 750, 5, 10, 65, false, '/galeria/IMG_1088.jpeg', true, 8),
('second-wind-surfing-full', '33333333-3333-4333-8333-333333333333', 'Surfing Tour - Full Day', 'full_day', 'Private boat rental for Surfing, Full Day with lunch where applicable.', 480, 950, 5, 10, 65, false, '/galeria/IMG_1088.jpeg', true, 9),
('second-wind-water-toys-half', '44444444-4444-4444-8444-444444444444', 'Water Toys Tour - Half Day', 'half_day', 'Private boat rental for Water Toys, Half Day.', 240, 750, 5, 10, 65, false, '/galeria/IMG_0007.jpeg', true, 10),
('second-wind-water-toys-three-quarter', '44444444-4444-4444-8444-444444444444', 'Water Toys Tour - 3/4 Day', 'three_quarter_day', 'Private boat rental for Water Toys, 3/4 Day.', 360, 850, 5, 10, 65, false, '/galeria/IMG_0007.jpeg', true, 11),
('second-wind-water-toys-full', '44444444-4444-4444-8444-444444444444', 'Water Toys Tour - Full Day', 'full_day', 'Private boat rental for Water Toys, Full Day with lunch where applicable.', 480, 1150, 5, 10, 65, false, '/galeria/IMG_0007.jpeg', true, 12),
('second-wind-bioluminescence-classic', '55555555-5555-4555-8555-555555555555', 'Bioluminescence Tour - Classic Experience', 'classic', 'Private boat rental for the Classic Bioluminescence Experience. Duration pending catalog confirmation.', null, 650, 5, 10, 65, false, '/images/placeholder-image.jpg', true, 13),
('second-wind-bioluminescence-deluxe', '55555555-5555-4555-8555-555555555555', 'Bioluminescence Tour - Deluxe Experience', 'deluxe', 'Private boat rental for the Deluxe Bioluminescence Experience. Duration pending catalog confirmation.', null, 750, 5, 10, 65, false, '/images/placeholder-image.jpg', true, 14)
on conflict (id) do update set
  boat_tour_id = excluded.boat_tour_id,
  name = excluded.name,
  package_type = excluded.package_type,
  description = excluded.description,
  duration_minutes = excluded.duration_minutes,
  base_price = excluded.base_price,
  included_guests = excluded.included_guests,
  max_guests = excluded.max_guests,
  extra_guest_price = excluded.extra_guest_price,
  custom_quote = excluded.custom_quote,
  image_url = excluded.image_url,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();
