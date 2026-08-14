const PAYPAL_API_BASE = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

export function getPayPalBaseUrl() {
  const environment = process.env.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'sandbox';
  return PAYPAL_API_BASE[environment];
}

export async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal server credentials are not configured.');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error_description || 'PayPal authentication failed.');
  return data.access_token;
}

export function getOrderStore() {
  if (!globalThis.__papagayoPayPalOrders) {
    globalThis.__papagayoPayPalOrders = new Map();
  }
  return globalThis.__papagayoPayPalOrders;
}
