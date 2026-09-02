import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight } from '../_shared/cors.ts';

const schema = z.object({
  tourPackageId: z.string().min(1),
  guests: z.number().int().positive(),
  boatId: z.string().min(1),
  tourId: z.string().min(1).optional(),
  departureLocationId: z.string().min(1).optional(),
  extras: z.array(z.object({ key: z.string().min(1).max(80), quantity: z.number().int().positive() })).default([]),
});

serve(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid pricing payload', issues: parsed.error.issues }, { status: 400, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: pkg, error } = await supabase
    .from('tour_packages')
    .select('id, boat_tour_id, base_price, included_guests, max_guests, extra_guest_price, custom_quote, boat_tours!inner(boat_id, tour_id, active, boats!inner(active, max_guests), tours!inner(active))')
    .eq('id', parsed.data.tourPackageId)
    .eq('active', true)
    .eq('boat_tours.boat_id', parsed.data.boatId)
    .eq('boat_tours.active', true)
    .eq('boat_tours.boats.active', true)
    .eq('boat_tours.tours.active', true)
    .single();

  if (error || !pkg) return Response.json({ message: 'Tour package not found' }, { status: 404, headers });
  const boatTour = Array.isArray(pkg.boat_tours) ? pkg.boat_tours[0] : pkg.boat_tours;
  const boat = Array.isArray(boatTour?.boats) ? boatTour.boats[0] : boatTour?.boats;
  if (!boatTour?.active) return Response.json({ message: 'Tour package is not available' }, { status: 404, headers });
  if (boatTour.boat_id !== parsed.data.boatId) return Response.json({ message: 'Tour package does not belong to boat' }, { status: 400, headers });
  if (parsed.data.tourId && boatTour.tour_id !== parsed.data.tourId) return Response.json({ message: 'Tour package does not belong to tour' }, { status: 400, headers });
  const effectiveMaxGuests = Math.min(pkg.max_guests, boat?.max_guests ?? pkg.max_guests);
  if (parsed.data.guests > effectiveMaxGuests) return Response.json({ message: 'Guest quantity exceeds capacity' }, { status: 400, headers });
  if (pkg.custom_quote) return Response.json({ custom_quote: true, total: null, currency: 'USD' }, { headers });

  const extraGuests = Math.max(parsed.data.guests - pkg.included_guests, 0);
  const extraGuestsTotal = extraGuests * Number(pkg.extra_guest_price);
  const pricedExtras = [];
  let extrasTotal = 0;
  let departureSurcharge = 0;
  let departureLocation = null;

  if (parsed.data.departureLocationId) {
    const { data: location, error: locationError } = await supabase
      .from('departure_locations')
      .select('id, name, slug, description, surcharge_amount, currency, active, sort_order, is_default')
      .eq('id', parsed.data.departureLocationId)
      .eq('active', true)
      .single();

    if (locationError) {
      return Response.json({ message: `Departure location lookup failed: ${locationError.message}` }, { status: 400, headers });
    }
    if (!location) return Response.json({ message: 'Departure location not found' }, { status: 404, headers });
    departureLocation = location;
    departureSurcharge = Number(location.surcharge_amount);
  }

  for (const extra of parsed.data.extras) {
    const { data: extraRecord } = await supabase
      .from('extras')
      .select('key, label, unit_price, package_extras!inner(tour_package_id, active)')
      .eq('key', extra.key)
      .eq('active', true)
      .eq('package_extras.tour_package_id', parsed.data.tourPackageId)
      .eq('package_extras.active', true)
      .single();

    if (!extraRecord) return Response.json({ message: `Invalid extra: ${extra.key}` }, { status: 400, headers });
    const unitPrice = Number(extraRecord.unit_price);
    const lineTotal = unitPrice * extra.quantity;
    extrasTotal += lineTotal;
    pricedExtras.push({ key: extraRecord.key, label: extraRecord.label, quantity: extra.quantity, unit_price: unitPrice, total: lineTotal });
  }

  const total = Number(pkg.base_price) + extraGuestsTotal + extrasTotal + departureSurcharge;

  return Response.json({
    custom_quote: false,
    base_price: Number(pkg.base_price),
    included_guests: pkg.included_guests,
    max_guests: effectiveMaxGuests,
    extra_guest_price: Number(pkg.extra_guest_price),
    extra_guests: extraGuests,
    extra_guests_total: extraGuestsTotal,
    extras: pricedExtras,
    extras_total: extrasTotal,
    departure_location: departureLocation,
    departure_surcharge: departureSurcharge,
    total,
    currency: 'USD',
  }, { headers });
});
