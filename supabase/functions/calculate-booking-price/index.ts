import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const schema = z.object({
  tourPackageId: z.string().min(1),
  guests: z.number().int().positive(),
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
    .select('base_price, included_guests, max_guests, extra_guest_price, custom_quote')
    .eq('id', parsed.data.tourPackageId)
    .eq('active', true)
    .single();

  if (error || !pkg) return Response.json({ message: 'Tour package not found' }, { status: 404, headers });
  if (parsed.data.guests > pkg.max_guests) return Response.json({ message: 'Guest quantity exceeds capacity' }, { status: 400, headers });
  if (pkg.custom_quote) return Response.json({ custom_quote: true, total: null, currency: 'USD' }, { headers });

  const extraGuests = Math.max(parsed.data.guests - pkg.included_guests, 0);
  const extraGuestsTotal = extraGuests * Number(pkg.extra_guest_price);
  const total = Number(pkg.base_price) + extraGuestsTotal;

  return Response.json({
    custom_quote: false,
    base_price: Number(pkg.base_price),
    included_guests: pkg.included_guests,
    max_guests: pkg.max_guests,
    extra_guest_price: Number(pkg.extra_guest_price),
    extra_guests: extraGuests,
    extra_guests_total: extraGuestsTotal,
    total,
    currency: 'USD',
  }, { headers });
});
