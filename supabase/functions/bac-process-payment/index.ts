import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';
import { areExternalProviderMocksAllowed } from '../_shared/environment.ts';
import { enqueueBookingConfirmationEmails } from '../_shared/booking-confirmation-email.ts';
import {
  buildSaleRequest,
  getBacGatewayApiUrl,
  getBacSecurityKey,
  getClientIpAddress,
  parseSaleResponse,
  validateThreeDSecure,
} from '../_shared/bac-gateway.ts';

// The browser sends only a single-use token and the 3DS result. Amount,
// currency and order id are always read from the booking row on the server.
const schema = z.object({
  bookingId: z.string().uuid(),
  paymentToken: z.string().min(8).max(200).regex(/^[A-Za-z0-9_-]+$/),
  threeDSecure: z.unknown(),
});

const MAX_ATTEMPTS_PER_BOOKING = 3;
const GATEWAY_TIMEOUT_MS = 30000;

serve(withCors(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid card payment payload' }, { status: 400, headers });
  const threeDSecure = validateThreeDSecure(parsed.data.threeDSecure);
  if (!threeDSecure) return Response.json({ message: '3-D Secure authentication is required' }, { status: 400, headers });

  let securityKey: string;
  let gatewayUrl: string;
  try {
    securityKey = getBacSecurityKey();
    gatewayUrl = getBacGatewayApiUrl();
  } catch {
    return Response.json({ message: 'Card payments are not available right now' }, { status: 503, headers });
  }

  const supabase = getSupabase();
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_reference, customers(full_name, email), boats(name), tour_packages(name)')
    .eq('id', parsed.data.bookingId)
    .single();
  if (bookingError || !booking) return Response.json({ message: 'Booking not found' }, { status: 404, headers });

  const { data: attempt, error: attemptError } = await supabase.rpc('begin_bac_payment_attempt', {
    p_booking_id: booking.id,
    p_max_attempts: MAX_ATTEMPTS_PER_BOOKING,
  });
  if (attemptError || !attempt) return attemptErrorResponse(attemptError, headers);

  const saleBody = buildSaleRequest({
    securityKey,
    paymentToken: parsed.data.paymentToken,
    amount: Number(attempt.amount).toFixed(2),
    taxAmount: Number(attempt.tax_amount).toFixed(2),
    currency: attempt.currency,
    orderId: attempt.booking_reference,
    orderDescription: `${booking.boats?.name ?? 'Boat'} - ${booking.tour_packages?.name ?? 'Tour package'}`,
    attemptId: attempt.attempt_id,
    customer: { fullName: booking.customers?.full_name ?? '', email: booking.customers?.email ?? '' },
    ipAddress: getClientIpAddress(req),
    threeDSecure,
  });

  let rawResponse: string;
  try {
    rawResponse = await postSale(gatewayUrl, saleBody, parsed.data.paymentToken, attempt.amount);
  } catch (error) {
    // Outcome unknown (timeout / network): the attempt stays "processing" so it
    // is never retried automatically and cannot be charged twice. An admin
    // reconciles it against the BAC portal using the booking reference.
    console.error('BAC sale outcome unknown', { attemptId: attempt.attempt_id, reason: error instanceof Error ? error.name : 'unknown' });
    return Response.json({ message: 'We could not confirm the payment result. Do not retry; contact us with your booking reference.', bookingReference: attempt.booking_reference }, { status: 502, headers });
  }

  const result = parseSaleResponse(rawResponse, attempt.booking_reference);
  const audit = { ...result.audit, eci: threeDSecure.eci, cardholder_auth: threeDSecure.cardHolderAuth, three_ds_version: threeDSecure.threeDsVersion };

  const { data: settled, error: settleError } = await supabase.rpc('complete_bac_payment_attempt', {
    p_attempt_id: attempt.attempt_id,
    p_approved: result.approved,
    p_transaction_id: result.transactionId,
    p_amount: Number(attempt.amount),
    p_currency: attempt.currency,
    p_note: result.approved ? 'BAC card payment approved' : `BAC card payment declined (${result.responseCode || 'no code'})`,
    p_raw_response: audit,
  });
  if (settleError || !settled) {
    console.error('BAC payment could not be recorded', { attemptId: attempt.attempt_id, code: settleError?.code });
    return Response.json({ message: 'We could not confirm the payment result. Do not retry; contact us with your booking reference.', bookingReference: attempt.booking_reference }, { status: 500, headers });
  }

  if (!result.approved) {
    // Deliberately generic: detailed decline reasons help card-testing bots.
    return Response.json({ message: 'The card payment was declined. Please check your details or use another card.', bookingReference: attempt.booking_reference }, { status: 402, headers });
  }

  await enqueueBookingConfirmationEmails(supabase, booking.id).catch((emailError) => {
    console.error('Booking confirmation email could not be queued', emailError);
  });

  return Response.json({
    bookingId: booking.id,
    bookingReference: attempt.booking_reference,
    transactionId: result.transactionId,
    amount: Number(attempt.amount).toFixed(2),
    currency: attempt.currency,
    paymentStatus: settled.payment_status,
    bookingStatus: settled.booking_status,
  }, { headers });
}));

function attemptErrorResponse(error: { code?: string } | null, headers: HeadersInit) {
  if (error?.code === '55P03') return Response.json({ message: 'A payment for this booking is already being processed' }, { status: 409, headers });
  if (error?.code === '54000') return Response.json({ message: 'Too many payment attempts for this booking. Please contact us.' }, { status: 429, headers });
  return Response.json({ message: 'This booking cannot be paid by card right now' }, { status: 400, headers });
}

function getSupabase() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function postSale(url: string, body: URLSearchParams, paymentToken: string, amount: number | string): Promise<string> {
  if (areExternalProviderMocksAllowed()) return mockSaleResponse(paymentToken, body.get('orderid') ?? '', amount);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Local/test only (see areExternalProviderMocksAllowed): token text picks the outcome.
function mockSaleResponse(paymentToken: string, orderId: string, amount: number | string) {
  if (paymentToken.includes('TIMEOUT')) throw new Error('Mock gateway timeout');
  if (paymentToken.includes('DECLINE')) return `response=2&responsetext=DECLINE&response_code=200&transactionid=MOCK-DECLINED&orderid=${orderId}&type=sale`;
  return `response=1&responsetext=SUCCESS&authcode=123456&response_code=100&transactionid=MOCK-${Number(amount).toFixed(2)}-${crypto.randomUUID()}&orderid=${orderId}&type=sale`;
}
