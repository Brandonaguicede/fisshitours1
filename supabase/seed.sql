insert into public.boats (id, slug, name, image_url, images, badge, base_price_label, length, engine, included_guests, max_guests, extra_guest_price, featured_spec, sort_order)
values (
  'segundo-viento',
  'second-wind',
  'Second Wind',
  '/botes/IMG_4792.jpeg',
  '["/botes/IMG_4792.jpeg","/botes/cffc9ef1-c305-40ad-9cd4-e5fe431e0dea.jpeg","/botes/D8EAD874-70EB-444D-ACED-E66D32B684A0.jpeg","/botes/bc8a597a-e04d-40c7-999d-b1117052eff6.jpeg","/botes/39188b9b-2a17-4296-a7dc-17bfca5cb618.jpeg","/botes/33408243-8c66-40a2-bcea-27272519d847.jpeg"]'::jsonb,
  'Luxury meets nature',
  'From $600',
  '32 ft Cigarette boat',
  'Yamaha 250 HP',
  5,
  10,
  65,
  'Garmin GPS, VHF radio, premium JBL sound, Bluetooth, restroom, water toys, tuna tube, live bait well, safety equipment, liability insurance.',
  1
) on conflict (id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  images = excluded.images,
  updated_at = now();

insert into public.tours (id, title, slug, location, description, long_description, image_url, category, rating, highlights, included, sort_order)
values
('beach-snorkeling', 'Beach & Snorkeling Tour', 'beach-snorkeling-tour', 'Gulf of Papagayo', 'Discover stunning beaches and vibrant marine life with snorkeling, paddleboarding, subwing or relaxed time in crystal-clear waters.', 'Discover the stunning beaches and vibrant marine life of the Gulf of Papagayo. Enjoy snorkeling, paddleboarding, subwing or simply relax in crystal-clear waters while observing dolphins, whales and sea turtles in their natural habitat. Includes alcoholic and non-alcoholic beverages, chips with guacamole, seasonal fruits and lunch on full-day tours.', '/galeria/867a2f50-e306-448d-bfd2-b082160e6dd8.jpeg', 'Snorkeling & Beach', 4.8, '["Snorkeling","Paddleboarding","Subwing","Wildlife watching"]'::jsonb, '["Alcoholic and non-alcoholic beverages","Chips with guacamole","Seasonal fruits","Lunch on full-day tours"]'::jsonb, 1),
('fishing', 'Fishing Tour', 'fishing-tour', 'Gulf of Papagayo', 'An unforgettable fishing adventure for experienced anglers and beginners with Penn International and Shimano equipment.', 'An unforgettable fishing adventure for experienced anglers and beginners. The tour includes Penn International and Shimano fishing equipment and is guided by experienced local professionals. Target species include yellowfin tuna, mahi-mahi, marlin, snapper, wahoo and sailfish.', '/a95baf49-2fa7-4c9a-ab8e-57cffc5c74b6.jpeg', 'Fishing', 4.9, '["Yellowfin tuna","Mahi-mahi","Marlin","Snapper","Wahoo","Sailfish"]'::jsonb, '["Alcoholic and non-alcoholic beverages","Chips with guacamole","Seasonal fruits","Lunch on full-day tours"]'::jsonb, 2),
('surfing', 'Surfing Tour', 'surfing-tour', 'Roca Bruja and Ollie''s Point', 'Cruise, swim and surf at two iconic Costa Rican surf locations with the itinerary adapted to the participants skill level.', 'Enjoy cruising, swimming and surfing at two iconic Costa Rican surf locations: Roca Bruja and Ollie''s Point. The itinerary is adapted to the participants skill level. Includes alcoholic and non-alcoholic beverages, chips with guacamole, seasonal fruits and lunch on full-day tours.', '/galeria/IMG_1088.jpeg', 'Surfing', 4.8, '["Roca Bruja","Ollie''s Point","Cruising","Swimming"]'::jsonb, '["Alcoholic and non-alcoholic beverages","Chips with guacamole","Seasonal fruits","Lunch on full-day tours"]'::jsonb, 3),
('water-toys', 'Water Toys Tour', 'water-toys-tour', 'Gulf of Papagayo', 'A tour that combines adrenaline, adventure, relaxation and fun in the Gulf of Papagayo.', 'A tour that combines adrenaline, adventure, relaxation and fun in the Gulf of Papagayo. Available activities include wakeboarding, paddleboarding, snorkeling, subwing and tubing.', '/galeria/IMG_0007.jpeg', 'Water Toys', 4.7, '["Wakeboarding","Paddleboarding","Snorkeling","Subwing","Tubing"]'::jsonb, '["Alcoholic and non-alcoholic beverages","Chips with guacamole","Seasonal fruits","Lunch on full-day tours"]'::jsonb, 4),
('bioluminescence', 'Bioluminescence Tour', 'bioluminescence-tour', 'Gulf of Papagayo', 'Discover the magical phenomenon of bioluminescence as night turns the ocean into a sea of stars.', 'Discover the magical phenomenon of bioluminescence in the Gulf of Papagayo. As night falls, every movement creates shimmering blue sparks, transforming the ocean into a sea of stars. The Classic Experience includes alcoholic and non-alcoholic beverages, chips with guacamole and seasonal fruits. The Deluxe Experience includes a cheese board, ceviche, sparkling wine and alcoholic and non-alcoholic beverages.', '/images/placeholder-image.jpg', 'Bioluminescence', 4.9, '["Classic Experience from $650","Deluxe Experience from $750","Shimmering blue sparks","Night ocean experience"]'::jsonb, '["Classic beverages and snacks","Deluxe cheese board","Deluxe ceviche","Deluxe sparkling wine"]'::jsonb, 5)
on conflict (id) do update set title = excluded.title, updated_at = now();

insert into public.boat_tours (id, boat_id, tour_id, sort_order)
values
('11111111-1111-4111-8111-111111111111', 'segundo-viento', 'beach-snorkeling', 1),
('22222222-2222-4222-8222-222222222222', 'segundo-viento', 'fishing', 2),
('33333333-3333-4333-8333-333333333333', 'segundo-viento', 'surfing', 3),
('44444444-4444-4444-8444-444444444444', 'segundo-viento', 'water-toys', 4),
('55555555-5555-4555-8555-555555555555', 'segundo-viento', 'bioluminescence', 5)
on conflict (boat_id, tour_id) do update set active = true;

insert into public.time_slots (id, label, starts_at, sort_order)
values
('morning', 'Morning', '07:00', 1),
('midday', 'Midday', '11:30', 2),
('afternoon', 'Afternoon', '15:30', 3),
('evening', 'Evening', '18:30', 4)
on conflict (id) do update set label = excluded.label, starts_at = excluded.starts_at;

insert into public.tour_packages (id, boat_tour_id, name, package_type, description, duration_minutes, base_price, included_guests, max_guests, extra_guest_price, custom_quote, image_url, sort_order)
values
('second-wind-beach-snorkeling-half', '11111111-1111-4111-8111-111111111111', 'Beach & Snorkeling Tour - Half Day', 'half_day', 'Discover the stunning beaches and vibrant marine life of the Gulf of Papagayo with snorkeling, paddleboarding, subwing or relaxed time in crystal-clear waters.', 240, 650, 5, 10, 65, false, '/galeria/867a2f50-e306-448d-bfd2-b082160e6dd8.jpeg', 1),
('second-wind-beach-snorkeling-three-quarter', '11111111-1111-4111-8111-111111111111', 'Beach & Snorkeling Tour - Three-Quarter Day', 'three_quarter_day', 'A longer Gulf of Papagayo beach and snorkeling route with time for marine life, paddleboarding, subwing and relaxed swimming.', 360, 750, 5, 10, 65, false, '/galeria/867a2f50-e306-448d-bfd2-b082160e6dd8.jpeg', 2),
('second-wind-beach-snorkeling-full', '11111111-1111-4111-8111-111111111111', 'Beach & Snorkeling Tour - Full Day', 'full_day', 'Full-day beach and snorkeling experience with lunch, crystal-clear water, paddleboarding, subwing and opportunities to observe dolphins, whales and sea turtles.', 480, 950, 5, 10, 65, false, '/galeria/867a2f50-e306-448d-bfd2-b082160e6dd8.jpeg', 3),
('second-wind-fishing-half', '22222222-2222-4222-8222-222222222222', 'Fishing Tour - Half Day', 'half_day', 'An unforgettable fishing adventure for experienced anglers and beginners, guided by experienced local professionals with Penn International and Shimano equipment.', 240, 700, 5, 10, 65, false, '/a95baf49-2fa7-4c9a-ab8e-57cffc5c74b6.jpeg', 4),
('second-wind-fishing-three-quarter', '22222222-2222-4222-8222-222222222222', 'Fishing Tour - Three-Quarter Day', 'three_quarter_day', 'A longer fishing route targeting yellowfin tuna, mahi-mahi, marlin, snapper, wahoo and sailfish with professional local guidance.', 360, 850, 5, 10, 65, false, '/a95baf49-2fa7-4c9a-ab8e-57cffc5c74b6.jpeg', 5),
('second-wind-fishing-full', '22222222-2222-4222-8222-222222222222', 'Fishing Tour - Full Day', 'full_day', 'Full-day sport fishing aboard Second Wind with Penn International and Shimano gear, local professionals and lunch included.', 480, 1050, 5, 10, 65, false, '/a95baf49-2fa7-4c9a-ab8e-57cffc5c74b6.jpeg', 6),
('second-wind-surfing-half', '33333333-3333-4333-8333-333333333333', 'Surfing Tour - Half Day', 'half_day', 'Cruise, swim and surf at iconic Costa Rican breaks such as Roca Bruja and Ollie''s Point, with the itinerary adapted to the group skill level.', 240, 600, 5, 10, 65, false, '/galeria/IMG_1088.jpeg', 7),
('second-wind-surfing-three-quarter', '33333333-3333-4333-8333-333333333333', 'Surfing Tour - Three-Quarter Day', 'three_quarter_day', 'More water time for cruising, swimming and surfing at Roca Bruja and Ollie''s Point, adjusted to the participants skill level.', 360, 750, 5, 10, 65, false, '/galeria/IMG_1088.jpeg', 8),
('second-wind-surfing-full', '33333333-3333-4333-8333-333333333333', 'Surfing Tour - Full Day', 'full_day', 'Full-day surf route with lunch, cruising, swimming and surfing at two iconic Costa Rican surf locations.', 480, 950, 5, 10, 65, false, '/galeria/IMG_1088.jpeg', 9),
('second-wind-water-toys-half', '44444444-4444-4444-8444-444444444444', 'Water Toys Tour - Half Day', 'half_day', 'A fun Gulf of Papagayo tour combining wakeboarding, paddleboarding, snorkeling, subwing and tubing.', 240, 750, 5, 10, 65, false, '/galeria/IMG_0007.jpeg', 10),
('second-wind-water-toys-three-quarter', '44444444-4444-4444-8444-444444444444', 'Water Toys Tour - Three-Quarter Day', 'three_quarter_day', 'A longer adventure with wakeboarding, paddleboarding, snorkeling, subwing, tubing and relaxed time in the Gulf of Papagayo.', 360, 850, 5, 10, 65, false, '/galeria/IMG_0007.jpeg', 11),
('second-wind-water-toys-full', '44444444-4444-4444-8444-444444444444', 'Water Toys Tour - Full Day', 'full_day', 'Full-day water toys adventure with wakeboarding, paddleboarding, snorkeling, subwing, tubing and lunch included.', 480, 1150, 5, 10, 65, false, '/galeria/IMG_0007.jpeg', 12),
('second-wind-bioluminescence-classic', '55555555-5555-4555-8555-555555555555', 'Bioluminescence Tour - Classic Experience', 'classic', 'Discover the magical phenomenon of bioluminescence in the Gulf of Papagayo as every movement creates shimmering blue sparks across the ocean.', null, 650, 5, 10, 65, false, '/images/placeholder-image.jpg', 13),
('second-wind-bioluminescence-deluxe', '55555555-5555-4555-8555-555555555555', 'Bioluminescence Tour - Deluxe Experience', 'deluxe', 'A deluxe bioluminescence night experience with cheese board, ceviche, sparkling wine and beverages aboard Second Wind.', null, 750, 5, 10, 65, false, '/images/placeholder-image.jpg', 14)
on conflict (id) do update set name = excluded.name, base_price = excluded.base_price, updated_at = now();

insert into public.extras (id, key, label, description, unit_price, active, sort_order)
values
('cheese-board', 'cheese-board', 'Cheese board', 'Assorted cheeses with crackers and dried fruits.', 25, true, 1),
('ceviche', 'ceviche', 'Fresh ceviche', 'Fresh catch ceviche with lime and cilantro.', 20, true, 2),
('sparkling-wine', 'sparkling-wine', 'Sparkling wine', 'Chilled sparkling wine for the group.', 30, true, 3)
on conflict (id) do update set label = excluded.label, unit_price = excluded.unit_price, updated_at = now();

insert into public.package_extras (tour_package_id, extra_id, active, sort_order)
values
('second-wind-bioluminescence-deluxe', 'cheese-board', true, 1),
('second-wind-bioluminescence-deluxe', 'ceviche', true, 2),
('second-wind-bioluminescence-deluxe', 'sparkling-wine', true, 3),
('second-wind-bioluminescence-classic', 'ceviche', true, 1)
on conflict (tour_package_id, extra_id) do update set active = excluded.active;

insert into public.payment_methods (key, name, description, type, active, instructions, logo_url, sort_order)
values
('paypal', 'PayPal', 'Secure USD checkout for the full booking total.', 'paypal', true, 'Customer pays the complete total through PayPal checkout.', '/images/paypal.png', 1),
('whatsapp-link', 'WhatsApp payment link', 'Request a manual payment link through WhatsApp.', 'whatsapp_link', true, 'Leaves booking pending payment until the admin verifies payment manually.', '/images/whatsapp.png', 2),
('pay-on-day', 'Pay on the Day of the Tour', 'Customer requests to pay when the tour starts.', 'pay_on_day', true, 'Leaves booking pending confirmation. It does not mark the booking as paid.', null, 3)
on conflict (key) do update set name = excluded.name, description = excluded.description, active = excluded.active, updated_at = now();

insert into public.reviews (name, country, quote, rating, status, featured)
values
('Andrea Vargas', 'Costa Rica', 'Armamos mitad pesca y mitad playa para la familia. Los ninos tuvieron juguetes acuaticos y los adultos salimos a pescar sin estres.', 5, 'approved', true),
('Marco Sullivan', 'Estados Unidos', 'La bioluminiscencia deluxe fue la mejor noche del viaje. Todo estuvo privado, bien coordinado y con un ritmo muy comodo.', 5, 'approved', true),
('Laura Mendez', 'Mexico', 'Reservamos snorkeling por la manana y playa por la tarde. Se sintio personalizado de verdad, no como un paquete generico.', 5, 'approved', true);

insert into public.gallery_images (id, src, image_url, alt, category, active, sort_order)
values
('gallery-fishing-mahi-1', '/galeria/IMG_9407.jpeg', '/galeria/IMG_9407.jpeg', 'Guest holding a mahi mahi aboard the charter boat', 'fishing', true, 1),
('gallery-fishing-sailfish-1', '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg', '/galeria/fec8db08-1bbc-435a-8ac6-03e31aadc685.jpeg', 'Family group releasing a sailfish beside the boat', 'fishing', true, 2),
('gallery-fishing-mahi-2', '/galeria/c242ddf0-18a9-44ef-bdde-24587f6b384e.jpeg', '/galeria/c242ddf0-18a9-44ef-bdde-24587f6b384e.jpeg', 'Angler holding a large mahi mahi on deck', 'fishing', true, 3),
('gallery-wakeboard', '/galeria/IMG_0007.jpeg', '/galeria/IMG_0007.jpeg', 'Wakeboarding behind the boat near the Guanacaste coast', 'experiences', true, 4),
('gallery-second-wind-coast', '/galeria/IMG_1088.jpeg', '/galeria/IMG_1088.jpeg', 'Second Wind cruising along a green Costa Rican coastline', 'boats', true, 5),
('gallery-turtle', '/galeria/IMG_9017.jpeg', '/galeria/IMG_9017.jpeg', 'Sea turtle swimming in deep blue water', 'wildlife', true, 6),
('gallery-whale', '/galeria/57f6e404-816d-4901-9c15-d2fe472f6541.jpeg', '/galeria/57f6e404-816d-4901-9c15-d2fe472f6541.jpeg', 'Humpback whale breaching offshore', 'wildlife', true, 7),
('gallery-beach-toys', '/galeria/867a2f50-e306-448d-bfd2-b082160e6dd8.jpeg', '/galeria/867a2f50-e306-448d-bfd2-b082160e6dd8.jpeg', 'Guests enjoying paddle boards and floating mat near the beach', 'beach', true, 8)
on conflict (id) do update set alt = excluded.alt, active = excluded.active, updated_at = now();

insert into public.destinations (id, name, region, image_url, description, active, sort_order)
values
('guanacaste', 'Guanacaste', 'Fishing y playa', '/images/placeholder-image.jpg', 'Costas amplias para pesca, snorkeling, juguetes acuaticos y dias completos frente al mar.', true, 1),
('golfo-nicoya', 'Golfo de Nicoya', 'Bioluminiscencia', '/images/placeholder-image.jpg', 'Aguas calmadas para tours nocturnos, navegacion suave y experiencias privadas.', true, 2),
('isla-chira', 'Isla Chira', 'Nocturno deluxe', '/images/placeholder-image.jpg', 'Escenario perfecto para bioluminiscencia, cenas ligeras y rutas mas intimas.', true, 3),
('playa-conchal', 'Playa Conchal', 'Snorkeling', '/images/placeholder-image.jpg', 'Mar claro, arena blanca y puntos protegidos para nadar con calma.', true, 4),
('tamarindo', 'Tamarindo', 'Juguetes acuaticos', '/images/placeholder-image.jpg', 'Base comoda para familias, grupos y experiencias de playa mas activas.', true, 5)
on conflict (id) do update set name = excluded.name, updated_at = now();

insert into public.editable_content (key, locale, type, value, group_name, label, description, active)
values
('home.hero.title', 'en', 'text', 'Private Fishing Tours Costa Rica', 'Home', 'Hero title', 'Main homepage hero title.', true),
('home.hero.subtitle', 'en', 'textarea', 'Private ocean adventures aboard Second Wind.', 'Home', 'Hero subtitle', 'Homepage hero supporting copy.', true),
('contact.whatsapp', 'en', 'text', '+506 8610 5784', 'Contact', 'WhatsApp', 'Displayed WhatsApp number.', true),
('contact.instagram', 'en', 'url', 'https://www.instagram.com/fishingtourscr/', 'Contact', 'Instagram', 'Instagram URL.', true),
('contact.facebook', 'en', 'url', 'https://www.facebook.com/profile.php?id=61579488863430', 'Contact', 'Facebook', 'Facebook URL.', true),
('booking.terms.cancellation', 'en', 'textarea', 'Cancellation rules are managed by admin.', 'Booking', 'Cancellation terms', 'Booking cancellation copy.', true),
('booking.terms.weather', 'en', 'textarea', 'Weather rescheduling applies to unsafe ocean conditions confirmed by the operator.', 'Booking', 'Weather terms', 'Weather policy copy.', true)
on conflict (key, locale) do update set value = excluded.value, updated_at = now();

insert into public.site_settings (key, value, type, active)
values
('display_phone', '+506 8610 5784', 'text', true),
('whatsapp_number', '50686105784', 'text', true),
('instagram_url', 'https://www.instagram.com/fishingtourscr/', 'url', true),
('facebook_url', 'https://www.facebook.com/profile.php?id=61579488863430', 'url', true)
on conflict (key) do update set value = excluded.value, updated_at = now();
