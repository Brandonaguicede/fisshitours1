import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight } from '../_shared/cors.ts';
import { enqueueBookingConfirmationEmails } from '../_shared/booking-confirmation-email.ts';

const schema = z.object({ bookingId: z.string().uuid() });

serve(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid booking payload' }, { status: 400, headers });

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

  try {
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

    const { data, error } = await userClient.rpc('update_booking_status', {
      p_booking_id: parsed.data.bookingId,
      p_booking_status: 'confirmed',
      p_payment_status: null,
      p_note: 'Reserva confirmada desde admin. Bote bloqueado en disponibilidad.',
    });
    if (error) return Response.json({ message: error.message }, { status: 400, headers });

    const { data: booking } = await adminClient
      .from('bookings')
      .select('customers(email)')
      .eq('id', parsed.data.bookingId)
      .single();
    const customerEmailPresent = Boolean(booking?.customers?.email);
    let emailQueued = false;
    if (customerEmailPresent) {
      await enqueueBookingConfirmationEmails(adminClient, parsed.data.bookingId)
        .then(() => { emailQueued = true; })
        .catch((emailQueueError) => {
          console.error('Admin booking confirmation email could not be queued', emailQueueError);
        });
    }

    return Response.json({ ...data, customerEmailPresent, emailQueued }, { headers });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : 'Booking could not be confirmed' }, { status: 500, headers });
  }
});
