import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight } from '../_shared/cors.ts';

const schema = z.object({
  boatId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

serve(async (req) => {
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

  const [{ data: slots, error: slotsError }, { data: blocks, error: blocksError }] = await Promise.all([
    supabase.from('time_slots').select('id, label, starts_at').eq('active', true).order('sort_order'),
    supabase
      .from('availability_blocks')
      .select('time_slot_id')
      .eq('boat_id', parsed.data.boatId)
      .eq('tour_date', parsed.data.date)
      .eq('active', true),
  ]);

  if (slotsError || blocksError) return Response.json({ message: 'Availability could not be loaded' }, { status: 400, headers });
  const unavailable = new Set((blocks ?? []).map((block) => block.time_slot_id));

  return Response.json({
    boatId: parsed.data.boatId,
    date: parsed.data.date,
    slots: (slots ?? []).map((slot) => ({
      id: slot.id,
      label: slot.label,
      time: String(slot.starts_at).slice(0, 5),
      available: !unavailable.has(slot.id),
    })),
  }, { headers });
});
