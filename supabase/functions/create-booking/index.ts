import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const schema = z.object({
  customer: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email(),
    whatsapp: z.string().min(7).max(32),
    country: z.string().max(80).optional(),
  }),
  boatId: z.string().min(1),
  tourId: z.string().min(1),
  tourPackageId: z.string().min(1),
  tourDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlotId: z.string().min(1),
  guests: z.number().int().positive(),
  mealOption: z.string().max(120).optional(),
  specialRequests: z.string().max(1000).optional(),
  paymentMethodKey: z.enum(['paypal', 'whatsapp-link', 'pay-on-day']),
  extras: z.array(z.object({ key: z.string().min(1).max(80), quantity: z.number().int().positive() })).default([]),
});

function cors() {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers: cors() });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid booking payload', issues: parsed.error.issues }, { status: 400, headers: cors() });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers: cors() });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const payload = sanitizePayload(parsed.data);
  const { data, error } = await supabase.rpc('create_booking_transaction', { payload });

  if (error) {
    const message = error.message || 'Booking could not be created';
    const status = message.includes('already reserved') ? 409 : 400;
    return Response.json({ message }, { status, headers: cors() });
  }

  return Response.json(data, { status: 201, headers: cors() });
});

function clean(value?: string) {
  return value?.trim().replace(/\s+/g, ' ') ?? undefined;
}

function sanitizePayload(value: z.infer<typeof schema>) {
  return {
    customer: {
      fullName: clean(value.customer.fullName),
      email: clean(value.customer.email)?.toLowerCase(),
      whatsapp: clean(value.customer.whatsapp),
      country: clean(value.customer.country),
    },
    boatId: value.boatId,
    tourId: value.tourId,
    tourPackageId: value.tourPackageId,
    tourDate: value.tourDate,
    timeSlotId: value.timeSlotId,
    guests: value.guests,
    mealOption: clean(value.mealOption),
    specialRequests: clean(value.specialRequests),
    paymentMethodKey: value.paymentMethodKey,
    extras: value.extras.map((extra) => ({
      key: clean(extra.key),
      quantity: extra.quantity,
    })),
  };
}
