import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendGa4Purchase, sendMetaPurchase, type CanonicalServerPurchase, type DeliveryResult } from '../_shared/server-conversions.ts';

const MAX_BATCH = 10;
const SITE_BOOKING_URL = 'https://papagayofishingtourcr.com/reservar';

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const x = new Uint8Array(a); const y = new Uint8Array(b);
  let difference = x.length ^ y.length;
  for (let index = 0; index < Math.min(x.length, y.length); index += 1) difference |= x[index] ^ y[index];
  return difference === 0;
}

type WorkerMode = 'validate' | 'live';

function configuredDestinations(mode: WorkerMode) {
  const destinations: Array<'ga4' | 'meta'> = [];
  if (Deno.env.get('GA4_MEASUREMENT_ID') && Deno.env.get('GA4_API_SECRET')) destinations.push('ga4');
  const metaConfigured = Deno.env.get('META_DATASET_ID') && Deno.env.get('META_CAPI_ACCESS_TOKEN') && Deno.env.get('META_GRAPH_API_VERSION');
  if (metaConfigured && (mode === 'live' || Deno.env.get('META_TEST_EVENT_CODE'))) destinations.push('meta');
  return destinations;
}

function safeErrorCode(error: unknown) {
  const code = error instanceof Error ? error.message : 'DELIVERY_ERROR';
  return /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'DELIVERY_ERROR';
}

serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405 });
  const expectedSecret = Deno.env.get('MEASUREMENT_WORKER_SECRET') ?? '';
  const suppliedSecret = req.headers.get('x-measurement-worker-secret') ?? '';
  if (expectedSecret.length < 32 || !(await secureEqual(suppliedSecret, expectedSecret))) {
    return Response.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const mode = Deno.env.get('SERVER_CONVERSIONS_MODE');
  if (mode !== 'validate' && mode !== 'live') return Response.json({ enabled: false, mode: 'disabled', processed: 0 });
  if (mode === 'live' && Deno.env.get('SERVER_CONVERSIONS_LIVE_APPROVED') !== 'true') {
    return Response.json({ message: 'Live server conversions require explicit approval' }, { status: 503 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Backend configuration missing' }, { status: 500 });
  const destinations = configuredDestinations(mode);
  if (!destinations.length) return Response.json({ message: 'No server conversion destination is configured' }, { status: 503 });

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const summary = { processed: 0, delivered: 0, suppressed: 0, deferred: 0, failed: 0 };

  for (let index = 0; index < MAX_BATCH; index += 1) {
    const { data: claims, error: claimError } = await db.rpc('claim_measurement_delivery', { p_destinations: destinations, p_lease_seconds: 90 });
    if (claimError) return Response.json({ message: 'Delivery claim failed', processed: summary.processed }, { status: 500 });
    const claim = claims?.[0];
    if (!claim) break;
    summary.processed += 1;

    let outcome: 'delivered' | 'suppressed' | 'failed' = 'failed';
    let result: DeliveryResult = { accepted: false, retryable: false, status: 0, errorCode: 'DELIVERY_ERROR' };
    try {
      const [{ data: booking, error: bookingError }, { data: attribution, error: attributionError }] = await Promise.all([
        db.from('bookings').select('id, total_snapshot, currency, customers(email, whatsapp)').eq('id', claim.booking_id).single(),
        db.from('measurement_attribution').select('analytics_consent, marketing_consent, ga_client_id, ga_session_id, fbp, fbc').eq('booking_id', claim.booking_id).maybeSingle(),
      ]);
      if (bookingError || attributionError || !booking || !attribution) throw new Error('MEASUREMENT_CONTEXT_MISSING');
      const payload = claim.payload as { transaction_id?: unknown; value?: unknown; currency?: unknown };
      const purchase: CanonicalServerPurchase = {
        transactionId: String(payload.transaction_id ?? ''),
        occurredAt: claim.occurred_at,
        value: Number(payload.value),
        currency: payload.currency === 'USD' ? 'USD' : ('' as 'USD'),
        analyticsConsent: attribution.analytics_consent === true,
        marketingConsent: attribution.marketing_consent === true,
        gaClientId: attribution.ga_client_id,
        gaSessionId: attribution.ga_session_id,
        email: booking.customers?.email,
        phone: booking.customers?.whatsapp,
        fbp: attribution.fbp,
        fbc: attribution.fbc,
      };

      if (claim.destination === 'ga4') {
        if (!purchase.analyticsConsent) throw new Error('ANALYTICS_CONSENT_REQUIRED');
        result = await sendGa4Purchase(purchase, {
          measurementId: Deno.env.get('GA4_MEASUREMENT_ID')!,
          apiSecret: Deno.env.get('GA4_API_SECRET')!,
          validateOnly: mode === 'validate',
        });
      } else if (claim.destination === 'meta') {
        if (!purchase.marketingConsent) throw new Error('MARKETING_CONSENT_REQUIRED');
        result = await sendMetaPurchase(purchase, {
          datasetId: Deno.env.get('META_DATASET_ID')!,
          accessToken: Deno.env.get('META_CAPI_ACCESS_TOKEN')!,
          graphVersion: Deno.env.get('META_GRAPH_API_VERSION')!,
          eventSourceUrl: SITE_BOOKING_URL,
          testEventCode: mode === 'validate' ? Deno.env.get('META_TEST_EVENT_CODE') || undefined : undefined,
        });
      } else throw new Error('DESTINATION_UNSUPPORTED');

      outcome = result.accepted ? 'delivered' : 'failed';
    } catch (error) {
      const code = safeErrorCode(error);
      outcome = /CONSENT_REQUIRED|CONTEXT_MISSING|CLIENT_ID_REQUIRED|MATCH_DATA_REQUIRED|TIME_OUT_OF_RANGE/.test(code) ? 'suppressed' : 'failed';
      result = { accepted: false, retryable: false, status: 0, errorCode: code };
    }

    const { error: completionError } = await db.rpc('complete_measurement_delivery', {
      p_delivery_id: claim.delivery_id,
      p_outcome: outcome,
      p_retryable: result.retryable,
      p_receipt: result.receipt ?? null,
      p_error_code: result.errorCode ?? null,
    });
    if (completionError) return Response.json({ message: 'Delivery completion failed', processed: summary.processed }, { status: 500 });
    if (outcome === 'delivered') summary.delivered += 1;
    else if (outcome === 'suppressed') summary.suppressed += 1;
    else if (result.retryable) summary.deferred += 1;
    else summary.failed += 1;
  }

  return Response.json({ enabled: true, mode, ...summary });
});
