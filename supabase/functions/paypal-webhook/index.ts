import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { areExternalProviderMocksAllowed } from '../_shared/environment.ts';
import { enqueueBookingConfirmationEmails } from '../_shared/booking-confirmation-email.ts';

serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405 });
  const webhookId = Deno.env.get('PAYPAL_WEBHOOK_ID');
  if (!webhookId) return Response.json({ message: 'PAYPAL_WEBHOOK_ID is not configured' }, { status: 500 });

  const rawBody = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ message: 'Invalid webhook payload' }, { status: 400 });
  }
  const verified = await verifyPayPalWebhook(req, payload, webhookId);
  if (!verified) return Response.json({ message: 'Invalid PayPal webhook signature' }, { status: 401 });

  const supabase = getSupabase();
  const providerEventId = payload.id as string;
  const eventType = payload.event_type as string;

  const { data: inserted, error: insertError } = await supabase
    .from('payment_webhook_events')
    .insert({ provider: 'paypal', provider_event_id: providerEventId, event_type: eventType, payload })
    .select('id, processed, payload')
    .single();

  let event = inserted;
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: existing, error: existingError } = await supabase
        .from('payment_webhook_events')
        .select('id, processed, payload')
        .eq('provider', 'paypal')
        .eq('provider_event_id', providerEventId)
        .single();
      if (existingError || !existing) return Response.json({ message: 'Webhook event could not be loaded' }, { status: 500 });
      if (existing.processed) return Response.json({ ok: true, duplicate: true });
      event = existing;
    } else {
      return Response.json({ message: 'Webhook event could not be stored' }, { status: 400 });
    }
  }

  try {
    await processPayPalEvent(supabase, event.payload);
  } catch (error) {
    console.error('PayPal webhook processing failed', error);
    return Response.json({ message: 'PayPal webhook processing failed' }, { status: 500 });
  }

  const { error: processedError } = await supabase
    .from('payment_webhook_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('id', event.id);
  if (processedError) return Response.json({ message: 'Webhook event could not be marked as processed' }, { status: 500 });

  return Response.json({ ok: true });
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
  const response = await fetchWithTimeout(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error_description ?? 'PayPal authentication failed');
  return data.access_token as string;
}

async function verifyPayPalWebhook(req: Request, payload: unknown, webhookId: string) {
  if (areExternalProviderMocksAllowed()) return req.headers.get('paypal-transmission-id') === 'mock-valid-webhook';
  const accessToken = await getPayPalAccessToken();
  const response = await fetchWithTimeout(`${getPayPalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: req.headers.get('paypal-auth-algo'),
      cert_url: req.headers.get('paypal-cert-url'),
      transmission_id: req.headers.get('paypal-transmission-id'),
      transmission_sig: req.headers.get('paypal-transmission-sig'),
      transmission_time: req.headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: payload,
    }),
  });
  const data = await response.json();
  return response.ok && data.verification_status === 'SUCCESS';
}

async function fetchWithTimeout(input: string, init: RequestInit, ms = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function processPayPalEvent(supabase: ReturnType<typeof createClient>, payload: any) {
  const eventType = payload.event_type as string;
  const resource = payload.resource ?? {};
  const orderId = resource.supplementary_data?.related_ids?.order_id ?? resource.id;
  const captureId = resource.id;
  const amount = resource.amount?.value ?? resource.seller_receivable_breakdown?.gross_amount?.value ?? '0.00';
  const currency = resource.amount?.currency_code ?? resource.seller_receivable_breakdown?.gross_amount?.currency_code ?? 'USD';

  const { data: payment } = await supabase
    .from('payments')
    .select('booking_id, provider_order_id')
    .eq('provider', 'paypal')
    .eq('provider_order_id', orderId)
    .maybeSingle();

  if (!payment?.booking_id) return;

  if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
    const { error } = await supabase.rpc('mark_paypal_payment_paid', {
      p_booking_id: payment.booking_id,
      p_paypal_order_id: orderId,
      p_paypal_capture_id: captureId,
      p_amount: amount,
      p_currency: currency,
      p_raw_response: payload,
    });
    if (error) throw error;
    await enqueueBookingConfirmationEmails(supabase, payment.booking_id);
    return;
  }

  if (eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'PAYMENT.CAPTURE.DECLINED') {
    const { error } = await supabase.rpc('mark_paypal_payment_unsuccessful', {
      p_booking_id: payment.booking_id,
      p_paypal_order_id: orderId,
      p_status: eventType,
      p_raw_response: payload,
    });
    if (error) throw error;
    return;
  }

  if (eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED') {
    const { error } = await supabase.rpc('mark_paypal_payment_refunded', {
      p_booking_id: payment.booking_id,
      p_paypal_order_id: orderId,
      p_amount: amount,
      p_currency: currency,
      p_raw_response: payload,
    });
    if (error) throw error;
  }
}
