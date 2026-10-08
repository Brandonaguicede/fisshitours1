import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';
import { CURRENT_TERMS_VERSION, checkTermsAcceptance } from '../_shared/terms.mjs';

const schema = z.object({
  customer: z.object({
    fullName: z.string().min(2).max(120),
    email: z.union([z.string().email(), z.literal('')]).optional(),
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
  paymentMethodKey: z.enum(['whatsapp-link']).default('whatsapp-link'),
  extras: z.array(z.object({ key: z.string().min(1).max(80), quantity: z.number().int().positive() })).default([]),
  adminNote: z.string().max(1000).optional(),
  language: z.enum(['es', 'en']).default('es'),
  // The operator confirms the customer accepted the terms (WhatsApp, phone...). The version, the "admin" source and the timestamp are
  // fixed by the server: the Admin client cannot choose them.
  termsAccepted: z.unknown().optional(),
});

serve(withCors(async (req) => {
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

  // The Admin client never sends a version: the server supplies the current one whenever the operator sent a confirmation of any kind.
  const terms = checkTermsAcceptance({ termsAccepted: parsed.data.termsAccepted, termsVersion: parsed.data.termsAccepted === undefined ? undefined : CURRENT_TERMS_VERSION });
  if (!terms.ok) return Response.json({ message: terms.code, code: terms.code }, { status: terms.status, headers });

  const payload = sanitizePayload(parsed.data, terms.legacy ? null : terms.termsVersion);
  const { data, error } = await adminClient.rpc('create_booking_transaction', { payload });
  if (error) {
    const message = error.message || 'Booking could not be created';
    const termsCode = /TERMS_[A-Z_]+/.exec(message)?.[0];
    if (termsCode) return Response.json({ message: termsCode, code: termsCode }, { status: 400, headers });
    return Response.json({ message }, { status: message.includes('BOAT_TIME_CONFLICT') || message.includes('already reserved') ? 409 : 400, headers });
  }

  return Response.json(data, { status: 201, headers });
}));

function clean(value?: string) {
  return value?.trim().replace(/\s+/g, ' ') || undefined;
}

// `termsVersion` is null only for a legacy Admin client during the rollout: nothing is invented for it.
function sanitizePayload(value: z.infer<typeof schema>, termsVersion: string | null) {
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
    language: value.language,
    ...(termsVersion ? { termsAccepted: true, termsVersion, termsAcceptedVia: 'admin' } : {}),
  };
}
