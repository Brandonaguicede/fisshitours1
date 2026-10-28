import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';
import { areExternalProviderMocksAllowed } from '../_shared/environment.ts';
import { enqueueBookingConfirmationEmails } from '../_shared/booking-confirmation-email.ts';
import { syncBookingCalendarAfterConfirmation } from '../_shared/booking-calendar.ts';
import {
  buildFollowUpRequest,
  getBacGatewayApiUrl,
  getBacSecurityKey,
  parseGatewayResponse,
  postGatewayRequest,
} from '../_shared/bac-gateway.ts';

// Admin money operations on a BAC card booking: Capture (an authorization), Void (an authorization or an
// unsettled sale/capture) and Refund (full or partial, of a settled sale/capture). Only active `admin`
// profiles may move money; editors can confirm bookings but cannot capture, void or refund.
// The browser sends the booking id, the operation and (refund only) an amount. The original gateway
// transaction and every limit are resolved from the payments ledger on the server.
const schema = z.object({
  bookingId: z.string().uuid(),
  operation: z.enum(['capture', 'void', 'refund']),
  amount: z.number().positive().max(100000).multipleOf(0.01).optional(),
});

const UNKNOWN_OUTCOME_MESSAGE = 'The gateway did not confirm the result. Do not retry: check the transaction in the BAC portal and reconcile it.';

serve(withCors(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid card operation payload' }, { status: 400, headers });
  if (parsed.data.operation !== 'refund' && parsed.data.amount !== undefined) {
    return Response.json({ message: 'Only refunds accept an amount' }, { status: 400, headers });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ message: 'Admin session required' }, { status: 401, headers });

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) return Response.json({ message: 'Invalid admin session' }, { status: 401, headers });
  const { data: profile, error: profileError } = await db.from('profiles').select('role, active').eq('id', userData.user.id).maybeSingle();
  if (profileError) return Response.json({ message: 'Admin profile could not be verified' }, { status: 500, headers });
  if (!profile?.active || profile.role !== 'admin') return Response.json({ message: 'Admin role required' }, { status: 403, headers });

  let securityKey: string;
  let gatewayUrl: string;
  try {
    securityKey = getBacSecurityKey();
    gatewayUrl = getBacGatewayApiUrl();
  } catch {
    return Response.json({ message: 'BAC gateway is not configured' }, { status: 503, headers });
  }

  const { data: operation, error: beginError } = await db.rpc('begin_bac_admin_operation', {
    p_booking_id: parsed.data.bookingId,
    p_operation: parsed.data.operation,
    p_amount: parsed.data.amount ?? null,
    p_actor: userData.user.id,
  });
  if (beginError || !operation) {
    if (beginError?.code === '55P03') return Response.json({ message: 'Another card operation for this booking is still in progress' }, { status: 409, headers });
    // RPC messages are our own validation texts (never gateway or secret data).
    return Response.json({ message: beginError?.message ?? 'Card operation is not allowed for this booking' }, { status: 400, headers });
  }

  let rawResponse: string;
  try {
    const body = buildFollowUpRequest({
      type: operation.operation,
      securityKey,
      transactionId: operation.gateway_transaction_id,
      amount: operation.operation === 'void' ? undefined : Number(operation.amount).toFixed(2),
      orderId: operation.booking_reference,
    });
    rawResponse = areExternalProviderMocksAllowed()
      ? mockFollowUpResponse(operation.gateway_transaction_id, operation.booking_reference)
      : await postGatewayRequest(gatewayUrl, body);
  } catch (error) {
    // Unknown outcome: the operation row stays "processing" and blocks further operations until reconciled.
    console.error('BAC admin operation outcome unknown', { operationId: operation.operation_id, operation: operation.operation, reason: error instanceof Error ? error.name : 'unknown' });
    return Response.json({ message: UNKNOWN_OUTCOME_MESSAGE, bookingReference: operation.booking_reference }, { status: 502, headers });
  }

  const result = parseGatewayResponse(rawResponse, operation.booking_reference);
  const { data: settled, error: settleError } = await db.rpc('complete_bac_admin_operation', {
    p_operation_id: operation.operation_id,
    p_approved: result.approved,
    p_transaction_id: result.transactionId,
    p_note: `BAC ${operation.operation} ${result.approved ? 'approved' : `declined (${result.responseCode || 'no code'})`} by admin`,
    p_raw_response: { ...result.audit, actor: userData.user.id },
  });
  if (settleError || !settled) {
    console.error('BAC admin operation could not be recorded', { operationId: operation.operation_id, code: settleError?.code });
    return Response.json({ message: UNKNOWN_OUTCOME_MESSAGE, bookingReference: operation.booking_reference }, { status: 500, headers });
  }

  if (!result.approved) {
    return Response.json({ ...settled, message: `The gateway declined the ${operation.operation}: ${result.responseText || 'no reason given'}` }, { status: 402, headers });
  }

  // Same follow-ups as the other confirmation / cancellation flows; neither can fail the money operation.
  if (operation.operation === 'capture' || operation.operation === 'void') {
    await syncBookingCalendarAfterConfirmation(db, parsed.data.bookingId);
  }
  if (operation.operation === 'capture') {
    await enqueueBookingConfirmationEmails(db, parsed.data.bookingId).catch((emailError) => {
      console.error('Booking confirmation email could not be queued', emailError);
    });
  }

  return Response.json(settled, { headers });
}));

// Local/test only (see areExternalProviderMocksAllowed).
function mockFollowUpResponse(transactionId: string, orderId: string) {
  if (transactionId.includes('DECLINE')) return `response=2&responsetext=DECLINE&response_code=200&transactionid=${transactionId}&orderid=${orderId}`;
  return `response=1&responsetext=SUCCESS&response_code=100&transactionid=${transactionId}-${crypto.randomUUID().slice(0, 8)}&orderid=${orderId}`;
}
