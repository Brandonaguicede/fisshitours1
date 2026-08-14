import { calculateServerTotal } from './catalog.js';
import { getOrderStore, getPayPalAccessToken, getPayPalBaseUrl } from './paypalClient.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    const { booking } = request.body || {};
    const total = calculateServerTotal(booking);
    const amount = total.toFixed(2);
    const accessToken = await getPayPalAccessToken();

    const paypalResponse = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: booking.bookingReference,
            description: `${booking.boat?.name || 'Second Wind'} - ${booking.tour?.name || 'Tour reservation'}`,
            amount: {
              currency_code: 'USD',
              value: amount,
            },
          },
        ],
      }),
    });

    const data = await paypalResponse.json();
    if (!paypalResponse.ok) {
      response.status(400).json({ message: data?.message || 'PayPal order could not be created.' });
      return;
    }

    getOrderStore().set(data.id, {
      bookingReference: booking.bookingReference,
      amount,
      currency: 'USD',
      status: 'CREATED',
    });

    response.status(200).json({ id: data.id, bookingReference: booking.bookingReference, amount, currency: 'USD' });
  } catch (error) {
    response.status(400).json({ message: error.message || 'PayPal order could not be created.' });
  }
}
