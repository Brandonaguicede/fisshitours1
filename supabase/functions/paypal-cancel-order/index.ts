import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight } from '../_shared/cors.ts';

const schema = z.object({ bookingId: z.string().uuid(), orderId: z.string().min(1).optional() });

serve(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid PayPal cancel payload', issues: parsed.error.issues }, { status: 400, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, paypal_order_id, payment_method_key')
    .eq('id', parsed.data.bookingId)
    .single();

  if (error || !booking) return Response.json({ message: 'Booking not found' }, { status: 404, headers });
  if (booking.payment_method_key !== 'paypal') return Response.json({ message: 'Booking payment method is not PayPal' }, { status: 400, headers });

  const orderId = parsed.data.orderId ?? booking.paypal_order_id ?? '';
  const { data, error: rpcError } = await supabase.rpc('mark_paypal_payment_unsuccessful', {
    p_booking_id: booking.id,
    p_paypal_order_id: orderId,
    p_status: 'PayPal checkout cancelled by customer',
    p_raw_response: { orderId, source: 'paypal-on-cancel' },
  });

  if (rpcError) return Response.json({ message: rpcError.message }, { status: 400, headers });
  return Response.json(data, { headers });
});
