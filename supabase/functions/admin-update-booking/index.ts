import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight } from '../_shared/cors.ts';

const schema = z.object({
  bookingId: z.string().uuid(),
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
  specialRequests: z.string().max(1000).optional(),
});

serve(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid booking update payload', issues: parsed.error.issues }, { status: 400, headers });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ message: 'Admin session required' }, { status: 401, headers });

  const adminClient = createClient(url, serviceRole, { auth: { persistSession: false } });
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return Response.json({ message: 'Invalid admin session' }, { status: 401, headers });
    const { data: profile, error: profileError } = await adminClient.from('profiles').select('role, active').eq('id', userData.user.id).maybeSingle();
    if (profileError) return Response.json({ message: 'Admin profile could not be verified' }, { status: 500, headers });
    if (!profile?.active || !['admin', 'editor'].includes(profile.role)) return Response.json({ message: 'Admin or editor role required' }, { status: 403, headers });

    const { data, error } = await userClient.rpc('update_booking_details', { payload: parsed.data });
    if (error) return Response.json({ message: error.message }, { status: 400, headers });
    return Response.json(data, { headers });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : 'Booking could not be updated' }, { status: 500, headers });
  }
});
