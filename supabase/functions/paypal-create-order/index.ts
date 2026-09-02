import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { areExternalProviderMocksAllowed } from '../_shared/environment.ts';

const schema = z.object({ bookingId: z.string().uuid() });
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
    if (!parsed.success) return Response.json({ message: 'Invalid PayPal payload', issues: parsed.error.issues }, { status: 400, headers });

    const supabase = getSupabase();
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, booking_reference, total_snapshot, currency, payment_method_key, payment_status, booking_status, expires_at, boats(name), tour_packages(name)')
      .eq('id', parsed.data.bookingId)
      .single();

    if (error || !booking) return Response.json({ message: 'Booking not found' }, { status: 404, headers });
    if (booking.payment_method_key !== 'paypal') return Response.json({ message: 'Booking payment method is not PayPal' }, { status: 400, headers });
    if (booking.booking_status !== 'pending_payment' || !['pending', 'processing'].includes(booking.payment_status)) {
      return Response.json({ message: 'Booking is not ready for PayPal' }, { status: 400, headers });
    }
    if (booking.expires_at && new Date(booking.expires_at).getTime() <= Date.now()) {
      return Response.json({ message: 'Booking payment hold has expired' }, { status: 410, headers });
    }

    const accessToken = await getPayPalAccessToken();
    const amount = Number(booking.total_snapshot).toFixed(2);
    const orderResponse = await fetchWithTimeout(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: booking.id,
          invoice_id: booking.booking_reference,
          description: `${booking.boats?.name ?? 'Boat'} - ${booking.tour_packages?.name ?? 'Tour package'}`,
          amount: { currency_code: booking.currency, value: amount },
        }],
      }),
    });

    const data = await orderResponse.json();
    if (!orderResponse.ok) return Response.json({ message: data?.message ?? data?.error_description ?? data?.error ?? 'PayPal order could not be created' }, { status: 400, headers });

    const { error: rpcError } = await supabase.rpc('mark_paypal_order_created', {
      p_booking_id: booking.id,
      p_paypal_order_id: data.id,
      p_amount: amount,
      p_currency: booking.currency,
      p_raw_response: data,
    });
    if (rpcError) return Response.json({ message: rpcError.message }, { status: 400, headers });

    return Response.json({ id: data.id, bookingId: booking.id, bookingReference: booking.booking_reference, amount, currency: booking.currency }, { headers });
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

async function fetchWithTimeout(input: string, init: RequestInit, ms = 15000) {
  if (areExternalProviderMocksAllowed() && input.includes('/v2/checkout/orders')) {
    const body = JSON.parse(String(init.body ?? '{}'));
    return Response.json({ id: `MOCK-${body.purchase_units?.[0]?.invoice_id ?? crypto.randomUUID()}`, status: 'CREATED' });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
