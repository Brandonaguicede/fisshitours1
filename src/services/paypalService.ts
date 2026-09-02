import { functionsUrl, supabase } from '../lib/supabase';

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: PayPalButtonOptions) => { render: (selector: string) => Promise<void> };
    };
  }
}

interface PayPalButtonOptions {
  style?: Record<string, string | boolean>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
}

export interface PayPalCaptureResult {
  bookingReference: string;
  bookingId: string;
  orderId: string;
  transactionId: string;
  amount: string;
  currency: string;
  paymentStatus: string;
  bookingStatus: string;
}

let paypalSdkPromise: Promise<void> | null = null;

export function loadPayPalSdk(clientId: string) {
  if (window.paypal) return Promise.resolve();
  if (paypalSdkPromise) return paypalSdkPromise;

  paypalSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('PayPal could not be loaded. Please try again.'));
    document.head.appendChild(script);
  });

  return paypalSdkPromise;
}

async function callPayPalFunction<T>(name: string, body: unknown): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${functionsUrl}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'PayPal request could not be completed.');
  return data as T;
}

export function getPayPalErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'PayPal returned an error. Please try again or choose another payment method.';
  }
}

export async function createPayPalOrder(bookingId: string) {
  const data = await callPayPalFunction<{ id: string }>('paypal-create-order', { bookingId });
  return data.id;
}

export async function capturePayPalOrder(orderId: string, bookingId: string, bookingReference: string) {
  const data = await callPayPalFunction<{
    booking_id: string;
    booking_status: string;
    payment_status: string;
    paypal_order_id: string;
    paypal_capture_id: string;
  }>('paypal-capture-order', { bookingId, orderId });
  return {
    bookingReference,
    bookingId: data.booking_id,
    orderId: data.paypal_order_id,
    transactionId: data.paypal_capture_id,
    amount: '',
    currency: 'USD',
    paymentStatus: data.payment_status,
    bookingStatus: data.booking_status,
  } satisfies PayPalCaptureResult;
}
