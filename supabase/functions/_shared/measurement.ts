// Called only AFTER existing payment verification and database settlement.
async function opaque(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pft-measurement-v1:${value}`));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export async function measurementReceipt(input: {
  bookingId: string; bookingStatus: string; paymentStatus?: string;
  transactionId?: string | null; amount?: number | string; currency?: string;
  provider?: 'bac' | 'paypal';
}) {
  try {
    const production = Deno.env.get('APP_ENV') === 'production'
      && Deno.env.get('MARKETING_MEASUREMENT_ENABLED') === 'true'
      && Deno.env.get('MOCK_EXTERNAL_PROVIDERS') !== 'true'
      && (input.provider !== 'bac' || Deno.env.get('BAC_LIVE_PAYMENTS_VERIFIED') === 'true')
      && (input.provider !== 'paypal' || Deno.env.get('PAYPAL_ENVIRONMENT') === 'live');
    const paid = input.paymentStatus === 'paid' && Boolean(input.transactionId)
      && Number.isFinite(Number(input.amount)) && Number(input.amount) > 0;
    const bookingMeasurementId = await opaque(`booking:${input.bookingId}`);
    return {
      booking_id: bookingMeasurementId,
      booking_confirmed: input.bookingStatus === 'confirmed',
      payment_confirmed: paid,
      // One stable site-owned ID across browser and future server delivery. Provider references remain accounting-only.
      ...(paid ? { transaction_id: bookingMeasurementId, value: Number(input.amount), currency: input.currency } : {}),
      production,
    };
  } catch { return undefined; } // Measurement must never fail a successful payment.
}
