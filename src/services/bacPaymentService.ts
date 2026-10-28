import { functionsUrl, supabase } from '../lib/supabase';
import { getStoredLanguage } from '../i18n/LanguageContext';

// Card data is entered in iframes served by the BAC gateway (Collect.js) and
// authenticated with 3-D Secure (Gateway.js). This app only ever receives a
// single-use token plus the 3DS result, and forwards them to the server.

export interface BacCollectResponse {
  token: string;
  card?: { type?: string | null; number?: string | null };
}

interface CollectJsConfig {
  variant: 'inline';
  fields: Record<'ccnumber' | 'ccexp' | 'cvv', { selector: string; placeholder?: string; title?: string }>;
  callback: (response: BacCollectResponse) => void;
  validationCallback?: (field: string, valid: boolean, message: string) => void;
  fieldsAvailableCallback?: () => void;
  timeoutDuration?: number;
  timeoutCallback?: () => void;
  customCss?: Record<string, string>;
  placeholderCss?: Record<string, string>;
  invalidCss?: Record<string, string>;
}

export interface BacThreeDSecureResult {
  cavv: string;
  xid?: string;
  eci: string;
  cardHolderAuth: string;
  threeDsVersion: string;
  directoryServerId?: string;
  cardHolderInfo?: string;
}

export interface BacThreeDSecureOptions {
  paymentToken: string;
  currency: string;
  amount: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

interface ThreeDSecureInterface {
  start: (selector: string) => void;
  on: (event: 'challenge' | 'complete' | 'failure' | 'error', handler: (event: unknown) => void) => void;
}

declare global {
  interface Window {
    CollectJS?: { configure: (config: CollectJsConfig) => void; startPaymentRequest: () => void };
    Gateway?: {
      create: (publicKey: string) => {
        get3DSecure: () => { createUI: (options: BacThreeDSecureOptions) => ThreeDSecureInterface };
        on: (event: 'error', handler: (event: unknown) => void) => void;
      };
    };
  }
}

export interface BacPaymentResult {
  bookingId: string;
  bookingReference: string;
  transactionId: string;
  amount: string;
  currency: string;
  paymentStatus: string;
  bookingStatus: string;
}

export class BacPaymentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'BacPaymentError';
  }

  /** Declines can be retried with another card; unknown outcomes and limits must not. */
  get retryable() {
    return this.status === 402 || this.status === 400;
  }
}

export function getBacConfig() {
  const publicKey = import.meta.env.VITE_BAC_PUBLIC_KEY?.trim() ?? '';
  const gatewayUrl = (import.meta.env.VITE_BAC_GATEWAY_URL?.trim() ?? '').replace(/\/+$/, '');
  const isMock = publicKey === 'mock';
  const configured = isMock || (Boolean(publicKey) && /^https:\/\/[a-z0-9.-]+$/i.test(gatewayUrl));
  return { publicKey, gatewayUrl, isMock, configured };
}

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string, attributes: Record<string, string> = {}) {
  const existing = scriptPromises.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromises.delete(src);
      script.remove();
      reject(new Error(getStoredLanguage() === 'es' ? 'No se pudo cargar el formulario de pago. Inténtalo de nuevo.' : 'The payment form could not be loaded. Please try again.'));
    };
    document.head.appendChild(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}

/** Scripts must come from the gateway itself (never self-hosted), per BAC/NMI requirements. */
export async function loadBacScripts() {
  const { publicKey, gatewayUrl } = getBacConfig();
  await Promise.all([
    loadScript(`${gatewayUrl}/token/Collect.js`, { 'data-tokenization-key': publicKey, 'data-variant': 'inline' }),
    loadScript(`${gatewayUrl}/js/v1/Gateway.js`),
  ]);
  if (!window.CollectJS || !window.Gateway) throw new Error(getStoredLanguage() === 'es' ? 'El formulario de pago no está disponible.' : 'The payment form is not available.');
}

export async function processBacPayment(bookingId: string, paymentToken: string, threeDSecure: BacThreeDSecureResult) {
  // cardHolderInfo is a message for the customer only; it must never reach the Payment API.
  const { cardHolderInfo: _cardHolderInfo, ...authentication } = threeDSecure;
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${functionsUrl}/bac-process-payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bookingId, paymentToken, threeDSecure: authentication }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BacPaymentError(data?.message || (getStoredLanguage() === 'es' ? 'No se pudo completar el pago con tarjeta.' : 'The card payment could not be completed.'), response.status);
  }
  return data as BacPaymentResult;
}
