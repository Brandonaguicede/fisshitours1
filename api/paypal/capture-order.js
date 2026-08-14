import { calculateServerTotal } from './catalog.js';
import { getOrderStore, getPayPalAccessToken, getPayPalBaseUrl } from './paypalClient.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    const { orderId, booking } = request.body || {};
    if (!orderId) throw new Error('Missing PayPal order id.');

    const total = calculateServerTotal(booking);
    const expectedAmount = total.toFixed(2);
    const expectedCurrency = 'USD';
    const orderStore = getOrderStore();
    const storedOrder = orderStore.get(orderId);

    if (storedOrder?.status === 'CAPTURED') {
      response.status(409).json({ message: 'This PayPal order was already processed.' });
      return;
    }

    const accessToken = await getPayPalAccessToken();
    const paypalResponse = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await paypalResponse.json();
    if (!paypalResponse.ok) {
      response.status(400).json({ message: data?.message || 'PayPal payment could not be captured.' });
      return;
    }

    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    const paidAmount = capture?.amount?.value;
    const paidCurrency = capture?.amount?.currency_code;

    if (data.status !== 'COMPLETED' || paidAmount !== expectedAmount || paidCurrency !== expectedCurrency) {
      orderStore.set(orderId, { bookingReference: booking.bookingReference, amount: expectedAmount, currency: expectedCurrency, status: 'PAYMENT_REVIEW' });
      response.status(400).json({ message: 'PayPal payment verification failed.' });
      return;
    }

    orderStore.set(orderId, {
      bookingReference: booking.bookingReference,
      amount: expectedAmount,
      currency: expectedCurrency,
      status: 'CAPTURED',
      transactionId: capture.id,
    });

    response.status(200).json({
      bookingReference: booking.bookingReference,
      orderId,
      transactionId: capture.id,
      amount: expectedAmount,
      currency: expectedCurrency,
    });
  } catch (error) {
    response.status(400).json({ message: error.message || 'PayPal payment could not be captured.' });
  }
}
