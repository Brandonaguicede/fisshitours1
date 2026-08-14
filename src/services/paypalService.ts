import type { BookingPaymentPayload } from '../utils/bookingPayment';

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
  orderId: string;
  transactionId: string;
  amount: string;
  currency: string;
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

export async function createPayPalOrder(booking: BookingPaymentPayload) {
  const response = await fetch('/api/paypal/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || 'PayPal order could not be created.');
  return data.id as string;
}

export async function capturePayPalOrder(orderId: string, booking: BookingPaymentPayload) {
  const response = await fetch('/api/paypal/capture-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, booking }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || 'PayPal payment could not be captured.');
  return data as PayPalCaptureResult;
}
