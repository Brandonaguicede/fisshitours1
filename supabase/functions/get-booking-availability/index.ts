import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';
import { resolveAvailableDepartures } from '../_shared/boat-availability.mjs';

const schema = z.object({
  boatId: z.string().min(1),
  tourId: z.string().min(1),
  tourPackageId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

serve(withCors(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid availability payload', issues: parsed.error.issues }, { status: 400, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  await supabase.rpc('expire_pending_paypal_bookings');

  const { data: boat } = await supabase.from('boats').select('id').eq('id', parsed.data.boatId).eq('active', true).maybeSingle();
  if (!boat) return Response.json({ message: 'Boat not found' }, { status: 404, headers });

  const { data: boatTour } = await supabase.from('boat_tours').select('id')
    .eq('boat_id', parsed.data.boatId).eq('tour_id', parsed.data.tourId).eq('active', true).maybeSingle();
  if (!boatTour) return Response.json({ message: 'Tour is not available for this boat' }, { status: 404, headers });
  const { data: tourPackage } = await supabase.from('tour_packages')
    .select('id, duration_minutes, departure_times, active, custom_quote')
    .eq('id', parsed.data.tourPackageId).eq('boat_tour_id', boatTour.id).eq('active', true).maybeSingle();
  if (!tourPackage || tourPackage.custom_quote || !Number.isInteger(tourPackage.duration_minutes) || tourPackage.duration_minutes <= 0) {
    return Response.json({ message: 'Tour package is not available for booking' }, { status: 400, headers });
  }

  const [{ data: slots, error: slotsError }, { data: blocks, error: blocksError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase.from('time_slots').select('id, label, starts_at').eq('active', true).order('sort_order'),
    supabase
      .from('availability_blocks')
      .select('time_slot_id')
      .eq('boat_id', parsed.data.boatId)
      .eq('tour_date', parsed.data.date)
      .eq('active', true)
      .neq('source', 'booking'),
    supabase.from('bookings').select('time_slot_id, tour_package_id, expires_at')
      .eq('boat_id', parsed.data.boatId).eq('tour_date', parsed.data.date)
      .neq('booking_status', 'cancelled').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  if (slotsError || blocksError || bookingsError) return Response.json({ message: 'Availability could not be loaded' }, { status: 400, headers });
  const existingPackageIds = [...new Set((bookings ?? []).map((booking) => booking.tour_package_id))];
  const existingSlotIds = [...new Set((bookings ?? []).map((booking) => booking.time_slot_id))];
  const [{ data: existingPackages, error: existingPackagesError }, { data: existingSlots, error: existingSlotsError }] = await Promise.all([
    existingPackageIds.length ? supabase.from('tour_packages').select('id, duration_minutes').in('id', existingPackageIds) : Promise.resolve({ data: [], error: null }),
    existingSlotIds.length ? supabase.from('time_slots').select('id, starts_at').in('id', existingSlotIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (existingPackagesError || existingSlotsError) return Response.json({ message: 'Availability could not be loaded' }, { status: 400, headers });
  const unavailable = new Set((blocks ?? []).map((block) => block.time_slot_id));
  const availableSlots = resolveAvailableDepartures({
    slots: slots ?? [], bookings: bookings ?? [], packages: existingPackages ?? [], timeSlots: existingSlots ?? [],
    durationMinutes: tourPackage.duration_minutes, departureTimes: tourPackage.departure_times as string[] | null,
    blockedSlotIds: unavailable,
  });

  return Response.json({
    boatId: parsed.data.boatId,
    date: parsed.data.date,
    slots: availableSlots,
  }, { headers });
}));
