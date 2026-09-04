import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight } from '../_shared/cors.ts';

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
  departureLocationId: z.string().min(1),
  mealOption: z.string().max(120).optional(),
  specialRequests: z.string().max(1000).optional(),
  paymentMethodKey: z.enum(['whatsapp-link', 'pay-on-day']).default('whatsapp-link'),
  extras: z.array(z.object({ key: z.string().min(1).max(80), quantity: z.number().int().positive() })).default([]),
  markAsPaid: z.boolean().default(false),
  adminNote: z.string().max(1000).optional(),
});

serve(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid booking payload', issues: parsed.error.issues }, { status: 400, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ message: 'Admin session required' }, { status: 401, headers });

  const adminClient = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ message: 'Invalid admin session' }, { status: 401, headers });

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError) return Response.json({ message: 'Admin profile could not be verified' }, { status: 500, headers });
  if (!profile?.active || !['admin', 'editor'].includes(profile.role)) {
    return Response.json({ message: 'Admin or editor role required' }, { status: 403, headers });
  }

  const payload = sanitizePayload(parsed.data);
  const { data, error } = await adminClient.rpc('create_booking_transaction', { payload });
  if (error) {
    const message = error.message || 'Booking could not be created';
    return Response.json({ message }, { status: message.includes('already reserved') ? 409 : 400, headers });
  }

  if (parsed.data.markAsPaid && data?.booking_id) {
    const { data: statusData, error: statusError } = await userClient.rpc('update_booking_status', {
      p_booking_id: data.booking_id,
      p_booking_status: 'confirmed',
      p_payment_status: 'paid',
      p_note: clean(parsed.data.adminNote) ?? 'Reserva creada manualmente desde admin como pagada por WhatsApp/link.',
    });
    if (statusError) return Response.json({ message: statusError.message }, { status: 400, headers });
    return Response.json({ ...data, ...statusData }, { status: 201, headers });
  }

  return Response.json(data, { status: 201, headers });
});

function clean(value?: string) {
  return value?.trim().replace(/\s+/g, ' ') || undefined;
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
    departureLocationId: value.departureLocationId,
    mealOption: clean(value.mealOption),
    specialRequests: clean(value.specialRequests),
    paymentMethodKey: value.paymentMethodKey,
    extras: value.extras.map((extra) => ({ key: clean(extra.key), quantity: extra.quantity })),
  };
}
