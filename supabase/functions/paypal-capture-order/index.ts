import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { areExternalProviderMocksAllowed } from '../_shared/environment.ts';

const schema = z.object({ bookingId: z.string().uuid(), orderId: z.string().min(1) });
const headers = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ message: 'Invalid capture payload', issues: parsed.error.issues }, { status: 400, headers });

    const supabase = getSupabase();
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, total_snapshot, currency, paypal_order_id')
      .eq('id', parsed.data.bookingId)
      .single();

    if (error || !booking) return Response.json({ message: 'Booking not found' }, { status: 404, headers });
    if (!booking.paypal_order_id || booking.paypal_order_id !== parsed.data.orderId) {
      return Response.json({ message: 'PayPal order does not match booking' }, { status: 400, headers });
    }

    const accessToken = await getPayPalAccessToken();
    const response = await fetchWithTimeout(`${getPayPalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(parsed.data.orderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }, 15000, Number(booking.total_snapshot).toFixed(2));
    const data = await response.json();
    if (!response.ok) return Response.json({ message: data?.message ?? data?.error_description ?? data?.error ?? 'PayPal payment could not be captured' }, { status: 400, headers });

    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    const amount = capture?.amount?.value;
    const currency = capture?.amount?.currency_code;
    const expectedAmount = Number(booking.total_snapshot).toFixed(2);

    if (data.status !== 'COMPLETED' || capture?.status !== 'COMPLETED' || amount !== expectedAmount || currency !== booking.currency) {
      await supabase.rpc('mark_paypal_payment_unsuccessful', {
        p_booking_id: booking.id,
        p_paypal_order_id: parsed.data.orderId,
        p_status: capture?.status ?? data.status ?? 'PayPal verification failed',
        p_raw_response: data,
      });
      return Response.json({ message: 'PayPal payment verification failed' }, { status: 400, headers });
    }

    const { data: result, error: rpcError } = await supabase.rpc('mark_paypal_payment_paid', {
      p_booking_id: booking.id,
      p_paypal_order_id: parsed.data.orderId,
      p_paypal_capture_id: capture.id,
      p_amount: amount,
      p_currency: currency,
      p_raw_response: data,
    });
    if (rpcError) return Response.json({ message: rpcError.message }, { status: 400, headers });

    return Response.json(result, { headers });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : 'PayPal request could not be completed' }, { status: 500, headers });
  }
});

function getSupabase() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

function getPayPalBaseUrl() {
  return Deno.env.get('PAYPAL_ENVIRONMENT') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalAccessToken() {
  if (areExternalProviderMocksAllowed()) return 'mock-paypal-access-token';
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const clientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('PayPal secrets are not configured');
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetchWithTimeout(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error_description ?? 'PayPal authentication failed');
  return data.access_token as string;
}

async function fetchWithTimeout(input: string, init: RequestInit, ms = 15000, expectedAmount = '715.00') {
  if (areExternalProviderMocksAllowed() && input.includes('/capture')) {
    const orderId = decodeURIComponent(input.split('/').at(-2) ?? 'MOCK-ORDER');
    if (orderId.includes('PENDING')) return Response.json({ status: 'PENDING', purchase_units: [{ payments: { captures: [{ id: 'MOCK-CAPTURE-PENDING', status: 'PENDING', amount: { value: '0.00', currency_code: 'USD' } }] } }] });
    if (orderId.includes('DECLINED')) return Response.json({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'MOCK-CAPTURE-DECLINED', status: 'DECLINED', amount: { value: '0.00', currency_code: 'USD' } }] } }] });
    if (orderId.includes('BADAMOUNT')) return Response.json({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'MOCK-CAPTURE-BADAMOUNT', status: 'COMPLETED', amount: { value: '1.00', currency_code: 'USD' } }] } }] });
    if (orderId.includes('BADCURRENCY')) return Response.json({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'MOCK-CAPTURE-BADCURRENCY', status: 'COMPLETED', amount: { value: expectedAmount, currency_code: 'CRC' } }] } }] });
    return Response.json({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: `CAP-${orderId}`, status: 'COMPLETED', amount: { value: expectedAmount, currency_code: 'USD' } }] } }] });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
