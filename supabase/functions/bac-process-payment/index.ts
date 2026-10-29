import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';
import { areExternalProviderMocksAllowed } from '../_shared/environment.ts';
import { enqueueBookingConfirmationEmails } from '../_shared/booking-confirmation-email.ts';
import { syncBookingCalendarAfterConfirmation } from '../_shared/booking-calendar.ts';
import { sendAdminBookingNotice } from '../_shared/admin-booking-notice.ts';
import {
  BAC_CURRENCY,
  buildSaleRequest,
  getBacCheckoutType,
  getBacGatewayApiUrl,
  getBacProcessorId,
  getBacSecurityKey,
  getClientIpAddress,
  parseGatewayResponse,
  postGatewayRequest,
  validateThreeDSecure,
} from '../_shared/bac-gateway.ts';

// Customer checkout: Credit Card - Sale, or Credit Card - Authorize when BAC_TRANSACTION_TYPE=auth
// (an admin then captures or voids it with admin-bac-transaction).
// The browser sends only a single-use token and the 3DS result. Amount,
// currency and order id are always read from the booking row on the server.
const schema = z.object({
  bookingId: z.string().uuid(),
  paymentToken: z.string().min(8).max(200).regex(/^[A-Za-z0-9_-]+$/),
  threeDSecure: z.unknown(),
});

const MAX_ATTEMPTS_PER_BOOKING = 3;
const UNKNOWN_OUTCOME_MESSAGE = 'We could not confirm the payment result. Do not retry; contact us with your booking reference.';

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
  let processorId: string | undefined;
  try {
    securityKey = getBacSecurityKey();
    gatewayUrl = getBacGatewayApiUrl();
    processorId = getBacProcessorId();
  } catch {
    return Response.json({ message: 'Card payments are not available right now' }, { status: 503, headers });
  }
  const transactionType = getBacCheckoutType();

  const supabase = getSupabase();
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_reference, currency, customers(full_name, email), boats(name), tour_packages(name)')
    .eq('id', parsed.data.bookingId)
    .single();
  if (bookingError || !booking) return Response.json({ message: 'Booking not found' }, { status: 404, headers });
  // Checked before an attempt exists, so an unsupported currency never leaves a "processing" row behind.
  if (booking.currency !== BAC_CURRENCY) return Response.json({ message: `Card payments are only available in ${BAC_CURRENCY}` }, { status: 422, headers });

  const { data: attempt, error: attemptError } = await supabase.rpc('begin_bac_payment_attempt', {
    p_booking_id: booking.id,
    p_max_attempts: MAX_ATTEMPTS_PER_BOOKING,
    p_transaction_type: transactionType,
  });
  if (attemptError || !attempt) return attemptErrorResponse(attemptError, headers);

  const saleBody = buildSaleRequest({
    type: transactionType,
    securityKey,
    paymentToken: parsed.data.paymentToken,
    amount: Number(attempt.amount).toFixed(2),
    taxAmount: Number(attempt.tax_amount).toFixed(2),
    currency: attempt.currency,
    processorId,
    orderId: attempt.booking_reference,
    orderDescription: `${booking.boats?.name ?? 'Boat'} - ${booking.tour_packages?.name ?? 'Tour package'}`,
    attemptId: attempt.attempt_id,
    customer: { fullName: booking.customers?.full_name ?? '', email: booking.customers?.email ?? '' },
    ipAddress: getClientIpAddress(req),
    threeDSecure,
  });

  let rawResponse: string;
  try {
    rawResponse = areExternalProviderMocksAllowed()
      ? mockCheckoutResponse(parsed.data.paymentToken, attempt.booking_reference, attempt.amount)
      : await postGatewayRequest(gatewayUrl, saleBody);
  } catch (error) {
    // Outcome unknown (timeout / network): the attempt stays "processing" so it
    // is never retried automatically and cannot be charged twice. An admin
    // reconciles it against the BAC portal using the booking reference.
    console.error('BAC checkout outcome unknown', { attemptId: attempt.attempt_id, reason: error instanceof Error ? error.name : 'unknown' });
    return Response.json({ message: UNKNOWN_OUTCOME_MESSAGE, bookingReference: attempt.booking_reference }, { status: 502, headers });
  }

  const result = parseGatewayResponse(rawResponse, attempt.booking_reference);
  const audit = { ...result.audit, eci: threeDSecure.eci, cardholder_auth: threeDSecure.cardHolderAuth, three_ds_version: threeDSecure.threeDsVersion };

  const { data: settled, error: settleError } = await supabase.rpc('complete_bac_payment_attempt', {
    p_attempt_id: attempt.attempt_id,
    p_approved: result.approved,
    p_transaction_id: result.transactionId,
    p_amount: Number(attempt.amount),
    p_currency: attempt.currency,
    p_note: result.approved ? `BAC card ${transactionType} approved` : `BAC card ${transactionType} declined (${result.responseCode || 'no code'})`,
    p_raw_response: audit,
  });
  if (settleError || !settled) {
    console.error('BAC payment could not be recorded', { attemptId: attempt.attempt_id, code: settleError?.code });
    return Response.json({ message: UNKNOWN_OUTCOME_MESSAGE, bookingReference: attempt.booking_reference }, { status: 500, headers });
  }

  if (!result.approved) {
    // Deliberately generic: detailed decline reasons help card-testing bots.
    return Response.json({ message: 'The card payment was declined. Please check your details or use another card.', bookingReference: attempt.booking_reference }, { status: 402, headers });
  }

  // Only a sale confirms the booking; an authorization waits for the admin capture,
  // which then runs the same Calendar sync and confirmation email.
  if (settled.booking_status === 'confirmed') {
    await syncBookingCalendarAfterConfirmation(supabase, booking.id);
    await enqueueBookingConfirmationEmails(supabase, booking.id).catch((emailError) => {
      console.error('Booking confirmation email could not be queued', emailError);
    });
  } else if (settled.payment_status === 'authorized') {
    // The funds are only held: the business must capture (or void) them, and an authorization expires at the issuer.
    await sendAdminBookingNotice(supabase, {
      bookingId: booking.id,
      subject: `Pago con tarjeta autorizado, pendiente de captura - ${attempt.booking_reference}`,
      text: `El banco autorizó el pago con tarjeta de la reserva ${attempt.booking_reference} por ${attempt.currency} ${Number(attempt.amount).toFixed(2)}.\n\nTodavía no se ha cobrado. Ingresa al panel administrativo, revisa la reserva y usa Capturar para cobrarla y confirmarla, o Anular para liberar los fondos.\n\nLa autorización vence en el banco emisor si no se captura a tiempo.`,
      dedupe: `booking:${booking.id}:bac-authorized-admin-email`,
    }).catch((noticeError) => console.error('Admin authorization notice failed', noticeError));
  }

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

// Local/test only (see areExternalProviderMocksAllowed): token text picks the outcome.
function mockCheckoutResponse(paymentToken: string, orderId: string, amount: number | string) {
  if (paymentToken.includes('TIMEOUT')) throw new Error('Mock gateway timeout');
  if (paymentToken.includes('DECLINE')) return `response=2&responsetext=DECLINE&response_code=200&transactionid=MOCK-DECLINED&orderid=${orderId}`;
  return `response=1&responsetext=SUCCESS&authcode=123456&response_code=100&transactionid=MOCK-${Number(amount).toFixed(2)}-${crypto.randomUUID()}&orderid=${orderId}`;
}
