import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const schema = z.object({
  tourPackageId: z.string().min(1),
  guests: z.number().int().positive(),
  boatId: z.string().min(1).optional(),
  tourId: z.string().min(1).optional(),
  extras: z.array(z.object({ key: z.string().min(1).max(80), quantity: z.number().int().positive() })).default([]),
});

const headers = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid pricing payload', issues: parsed.error.issues }, { status: 400, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: pkg, error } = await supabase
    .from('tour_packages')
    .select('id, boat_tour_id, base_price, included_guests, max_guests, extra_guest_price, custom_quote, boat_tours!inner(boat_id, tour_id, active)')
    .eq('id', parsed.data.tourPackageId)
    .eq('active', true)
    .single();

  if (error || !pkg) return Response.json({ message: 'Tour package not found' }, { status: 404, headers });
  const boatTour = Array.isArray(pkg.boat_tours) ? pkg.boat_tours[0] : pkg.boat_tours;
  if (!boatTour?.active) return Response.json({ message: 'Tour package is not available' }, { status: 404, headers });
  if (parsed.data.boatId && boatTour.boat_id !== parsed.data.boatId) return Response.json({ message: 'Tour package does not belong to boat' }, { status: 400, headers });
  if (parsed.data.tourId && boatTour.tour_id !== parsed.data.tourId) return Response.json({ message: 'Tour package does not belong to tour' }, { status: 400, headers });
  if (parsed.data.guests > pkg.max_guests) return Response.json({ message: 'Guest quantity exceeds capacity' }, { status: 400, headers });
  if (pkg.custom_quote) return Response.json({ custom_quote: true, total: null, currency: 'USD' }, { headers });

  const extraGuests = Math.max(parsed.data.guests - pkg.included_guests, 0);
  const extraGuestsTotal = extraGuests * Number(pkg.extra_guest_price);
  const pricedExtras = [];
  let extrasTotal = 0;

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

  const total = Number(pkg.base_price) + extraGuestsTotal + extrasTotal;

  return Response.json({
    custom_quote: false,
    base_price: Number(pkg.base_price),
    included_guests: pkg.included_guests,
    max_guests: pkg.max_guests,
    extra_guest_price: Number(pkg.extra_guest_price),
    extra_guests: extraGuests,
    extra_guests_total: extraGuestsTotal,
    extras: pricedExtras,
    extras_total: extrasTotal,
    total,
    currency: 'USD',
  }, { headers });
});
