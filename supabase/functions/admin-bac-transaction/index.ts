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

// Admin money operations on a BAC card booking:
//   * capture   — charge an authorization (full amount);
//   * void      — cancel an authorization or an unsettled sale/capture;
//   * refund    — full or partial refund of a settled sale/capture;
//   * reconcile — record the real outcome of a gateway call that timed out, after checking the BAC portal.
// Only active `admin` profiles may move money; editors can confirm bookings but cannot run these.
// The original gateway transaction and every limit are resolved from the payments ledger on the server.
const bookingId = z.string().uuid();
const schema = z.discriminatedUnion('operation', [
  z.object({ bookingId, operation: z.literal('capture') }).strict(),
  z.object({ bookingId, operation: z.literal('void') }).strict(),
  z.object({ bookingId, operation: z.literal('refund'), amount: z.number().positive().max(100000).multipleOf(0.01).optional() }).strict(),
  z.object({ bookingId, operation: z.literal('reconcile'), approved: z.boolean(), transactionId: z.string().trim().max(64).regex(/^[A-Za-z0-9-]*$/).optional() }).strict(),
]);

const UNKNOWN_OUTCOME_MESSAGE = 'The gateway did not confirm the result. Do not retry: check the transaction in the BAC portal and use Conciliar.';

serve(withCors(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid card operation payload' }, { status: 400, headers });
  const input = parsed.data;

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
  const actor = userData.user.id;

  if (input.operation === 'reconcile') {
    const { data: reconciled, error } = await db.rpc('reconcile_bac_operation', {
      p_booking_id: input.bookingId,
      p_approved: input.approved,
      p_transaction_id: input.transactionId ?? null,
      p_actor: actor,
    });
    if (error || !reconciled) {
      // RPC messages are our own validation texts (never gateway or secret data).
      return Response.json({ message: error?.message ?? 'The card operation could not be reconciled' }, { status: error?.code === '55P03' ? 409 : 400, headers });
    }
    if (reconciled.approved === true) await runFollowUps(db, input.bookingId, followUpFor(reconciled.reconciled, reconciled.booking_status));
    return Response.json(reconciled, { headers });
  }

  let securityKey: string;
  let gatewayUrl: string;
  try {
    securityKey = getBacSecurityKey();
    gatewayUrl = getBacGatewayApiUrl();
  } catch {
    return Response.json({ message: 'BAC gateway is not configured' }, { status: 503, headers });
  }

  const { data: operation, error: beginError } = await db.rpc('begin_bac_admin_operation', {
    p_booking_id: input.bookingId,
    p_operation: input.operation,
    p_amount: input.operation === 'refund' ? input.amount ?? null : null,
    p_actor: actor,
  });
  if (beginError || !operation) {
    if (beginError?.code === '55P03') return Response.json({ message: 'Another card operation for this booking is still pending: use Conciliar after checking the BAC portal' }, { status: 409, headers });
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
    p_raw_response: { ...result.audit, actor },
  });
  if (settleError || !settled) {
    console.error('BAC admin operation could not be recorded', { operationId: operation.operation_id, code: settleError?.code });
    return Response.json({ message: UNKNOWN_OUTCOME_MESSAGE, bookingReference: operation.booking_reference }, { status: 500, headers });
  }

  if (!result.approved) {
    return Response.json({ ...settled, message: `The gateway declined the ${operation.operation}: ${result.responseText || 'no reason given'}` }, { status: 402, headers });
  }

  await runFollowUps(db, input.bookingId, followUpFor(operation.operation, settled.booking_status));
  return Response.json(settled, { headers });
}));

type FollowUp = 'confirmed' | 'cancelled' | null;

/**
 * Only an approved operation that CHANGED the booking needs follow-ups: a sale/capture that confirmed it, or a void that
 * cancelled it. A refund (or an authorization) leaves the booking as it was, so nothing is re-sent.
 */
function followUpFor(transactionType: string, bookingStatus: string): FollowUp {
  if ((transactionType === 'sale' || transactionType === 'capture') && bookingStatus === 'confirmed') return 'confirmed';
  if (transactionType === 'void' && bookingStatus === 'cancelled') return 'cancelled';
  return null;
}

/** Same follow-ups as every other confirmation / cancellation flow; neither can fail the money operation. */
async function runFollowUps(db: ReturnType<typeof createClient>, id: string, followUp: FollowUp) {
  if (!followUp) return;
  await syncBookingCalendarAfterConfirmation(db, id);
  if (followUp === 'confirmed') {
    await enqueueBookingConfirmationEmails(db, id).catch((emailError) => {
      console.error('Booking confirmation email could not be queued', emailError);
    });
  }
}

// Local/test only (see areExternalProviderMocksAllowed).
function mockFollowUpResponse(transactionId: string, orderId: string) {
  if (transactionId.includes('DECLINE')) return `response=2&responsetext=DECLINE&response_code=200&transactionid=${transactionId}&orderid=${orderId}`;
  return `response=1&responsetext=SUCCESS&response_code=100&transactionid=${transactionId}-${crypto.randomUUID().slice(0, 8)}&orderid=${orderId}`;
}
