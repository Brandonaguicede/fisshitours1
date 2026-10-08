import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { areExternalProviderMocksAllowed } from '../_shared/environment.ts';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';
import { checkTermsAcceptance } from '../_shared/terms.mjs';
import { buildBookingRequestAdminHtml, buildBookingRequestCustomerHtml, buildBookingRequestSummary } from '../_shared/booking-confirmation-email.ts';

const schema = z.object({
  customer: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email(),
    whatsapp: z.string().min(7).max(32),
    country: z.string().max(80).optional(),
  }),
  boatId: z.string().min(1),
  tourId: z.string().min(1),
  tourPackageId: z.string().min(1),
  tourDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlotId: z.string().min(1),
  guests: z.number().int().positive(),
  departureLocationId: z.string().min(1),
  mealOption: z.string().max(120).optional(),
  specialRequests: z.string().max(1000).optional(),
  paymentMethodKey: z.enum(['paypal', 'whatsapp-link', 'pay-on-day']),
  extras: z.array(z.object({ key: z.string().min(1).max(80), quantity: z.number().int().positive() })).default([]),
  turnstileToken: z.string().optional(),
  // Persisted in bookings.language: the confirmation email is rendered in it, and it picks the language of the request-received email below.
  language: z.enum(['es', 'en']).optional().default('es'),
  // Terms and Conditions acceptance. Validated by checkTermsAcceptance (not by zod) so a missing / false value answers the semantic
  // TERMS_NOT_ACCEPTED. The timestamp and the "web" source are set here / in the database, never by the client.
  termsAccepted: z.unknown().optional(),
  termsVersion: z.unknown().optional(),
});

serve(withCors(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid booking payload', issues: parsed.error.issues }, { status: 400, headers });

  const terms = checkTermsAcceptance(parsed.data);
  if (!terms.ok) return Response.json({ message: terms.code, code: terms.code }, { status: terms.status, headers });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return Response.json({ message: 'Supabase secrets are not configured' }, { status: 500, headers });

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const payload = sanitizePayload(parsed.data, terms.legacy ? null : terms.termsVersion);
  const ipHash = await hashIp(getClientIp(req));
  const rateLimit = {
    maxRequests: Number(Deno.env.get('BOOKING_RATE_LIMIT_MAX_REQUESTS') ?? '8'),
    windowMinutes: Number(Deno.env.get('BOOKING_RATE_LIMIT_WINDOW_MINUTES') ?? '15'),
  };
  const { data: allowed, error: rateError } = await supabase.rpc('check_booking_rate_limit', {
    p_ip_hash: ipHash,
    p_limit: Number.isFinite(rateLimit.maxRequests) ? rateLimit.maxRequests : 8,
    p_window_minutes: Number.isFinite(rateLimit.windowMinutes) ? rateLimit.windowMinutes : 15,
  });
  if (rateError) return Response.json({ message: 'Rate limit check failed' }, { status: 400, headers });
  if (!allowed) return Response.json({ message: 'Too many booking requests. Try again later.' }, { status: 429, headers });

  const turnstileOk = await verifyTurnstile(parsed.data.turnstileToken, req);
  if (!turnstileOk) return Response.json({ message: 'Human verification failed' }, { status: 403, headers });

  const { data, error } = await supabase.rpc('create_booking_transaction', { payload });

  if (error) {
    const message = error.message || 'Booking could not be created';
    // The database is the last line of defense (migration 202610080002): translate its terms errors into the same semantic answer as above.
    const termsCode = /TERMS_[A-Z_]+/.exec(message)?.[0];
    if (termsCode) return Response.json({ message: termsCode, code: termsCode }, { status: 400, headers });
    const status = message.includes('BOAT_TIME_CONFLICT') || message.includes('already reserved') ? 409 : 400;
    return Response.json({ message }, { status, headers });
  }

  await sendBookingEmails(supabase, data, payload).catch((emailError) => {
    console.error('Booking email notification failed', emailError);
  });

  return Response.json(data, { status: 201, headers });
}));

function clean(value?: string) {
  return value?.trim().replace(/\s+/g, ' ') ?? undefined;
}

function getClientIp(req: Request) {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
}

async function verifyTurnstile(token: string | undefined, req: Request) {
  if (Deno.env.get('DISABLE_TURNSTILE') === 'true') return true;
  if (areExternalProviderMocksAllowed()) return token === 'mock-valid-turnstile';
  if (!token) return false;
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? Deno.env.get('CLOUDFLARE_TURNSTILE_SECRET_KEY');
  if (!secret) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  form.append('remoteip', getClientIp(req));

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const data = await response.json();
    const expectedHostname = Deno.env.get('TURNSTILE_EXPECTED_HOSTNAME');
    const expectedAction = Deno.env.get('TURNSTILE_BOOKING_ACTION');
    if (expectedHostname && data.hostname !== expectedHostname) return false;
    if (expectedAction && data.action !== expectedAction) return false;
    return response.ok && data.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function hashIp(value: string) {
  const secret = Deno.env.get('RATE_LIMIT_HASH_SECRET');
  if (!secret) throw new Error('Rate limit secret is not configured');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// `termsVersion` is null only for a legacy client during the rollout (no terms fields sent): nothing is invented for it.
function sanitizePayload(value: z.infer<typeof schema>, termsVersion: string | null) {
  return {
    customer: {
      fullName: clean(value.customer.fullName),
      email: clean(value.customer.email)?.toLowerCase(),
      whatsapp: clean(value.customer.whatsapp),
      country: clean(value.customer.country),
    },
    boatId: value.boatId,
    tourId: value.tourId,
    tourPackageId: value.tourPackageId,
    tourDate: value.tourDate,
    timeSlotId: value.timeSlotId,
    guests: value.guests,
    departureLocationId: value.departureLocationId,
    mealOption: clean(value.mealOption),
    specialRequests: clean(value.specialRequests),
    paymentMethodKey: value.paymentMethodKey,
    extras: value.extras.map((extra) => ({
      key: clean(extra.key),
      quantity: extra.quantity,
    })),
    language: value.language,
    ...(termsVersion ? { termsAccepted: true, termsVersion, termsAcceptedVia: 'web' } : {}),
  };
}

async function sendBookingEmails(supabase: ReturnType<typeof createClient>, booking: any, payload: ReturnType<typeof sanitizePayload>) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('BOOKING_EMAIL_FROM');
  const adminEmail = Deno.env.get('BOOKING_ADMIN_EMAIL');
  const customerEmail = payload.customer.email;
  if (!booking?.booking_id || !customerEmail) return;
  // PayPal reservations are notified only after capture succeeds. The capture
  // function queues the paid confirmation once PayPal returns COMPLETED.
  if (payload.paymentMethodKey === 'paypal') return;

  const es = payload.language !== 'en';
  const summary = [
    await buildBookingRequestSummary(supabase, booking.booking_id, es ? 'es' : 'en'),
    `${es ? 'Metodo de pago' : 'Payment method'}: ${payload.paymentMethodKey}`,
    `${es ? 'Estado de la reserva' : 'Booking status'}: ${booking.booking_status}`,
    `${es ? 'Estado del pago' : 'Payment status'}: ${booking.payment_status}`,
    `${es ? 'Notas' : 'Notes'}: ${payload.specialRequests ?? (es ? 'Ninguna' : 'None')}`,
  ].join('\n');
  const adminSummary = es ? summary : [
    await buildBookingRequestSummary(supabase, booking.booking_id, 'es'),
    `Metodo de pago: ${payload.paymentMethodKey}`,
    `Estado de la reserva: ${booking.booking_status}`,
    `Estado del pago: ${booking.payment_status}`,
    `Notas: ${payload.specialRequests ?? 'Ninguna'}`,
  ].join('\n');

  const messages = [
    payload.paymentMethodKey !== 'whatsapp-link' ? {
      to: customerEmail,
      subject: es ? `Solicitud de reserva ${booking.booking_reference}` : `Booking request ${booking.booking_reference}`,
      html: await buildBookingRequestCustomerHtml(supabase, booking.booking_id, es ? 'es' : 'en'),
      text: es
        ? `Hemos recibido tu solicitud de reserva.\n\n${summary}\n\nNuestro equipo confirmará la disponibilidad y te contactará pronto.`
        : `We have received your booking request.\n\n${summary}\n\nOur team will confirm availability and contact you soon.`,
      dedupe: `booking:${booking.booking_id}:customer-email`,
    } : null,
    adminEmail ? {
      to: adminEmail,
      subject: `Nueva reserva ${booking.booking_reference}`,
      html: await buildBookingRequestAdminHtml(supabase, booking.booking_id),
      text: `Nueva reserva recibida.\n\n${adminSummary}`,
      dedupe: `booking:${booking.booking_id}:admin-email`,
    } : null,
  ].filter(Boolean) as Array<{ to: string; subject: string; text: string; html?: string; dedupe: string }>;

  for (const message of messages) {
    if (!apiKey || !from) {
      await recordEmailNotification(supabase, booking.booking_id, message, false);
      continue;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text, html: message.html }),
    });

    await recordEmailNotification(supabase, booking.booking_id, message, response.ok);
    if (!response.ok) console.error('Resend email failed', await response.text());
  }
}

async function recordEmailNotification(
  supabase: ReturnType<typeof createClient>,
  bookingId: string,
  message: { to: string; subject: string; text: string; html?: string; dedupe: string },
  sent: boolean,
) {
  await supabase.from('booking_notifications').insert({
    booking_id: bookingId,
    type: 'email',
    channel: 'email',
    dedupe_key: message.dedupe,
    payload: { to: message.to, subject: message.subject, text: message.text, html: message.html },
    sent_at: sent ? new Date().toISOString() : null,
  });
}
