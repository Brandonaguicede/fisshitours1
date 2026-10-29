// BAC/NMI browser configuration. BAC issues two different PUBLIC keys and each script accepts only its own:
//   - Tokenization key ("Token")      -> Collect.js `data-tokenization-key` (card fields -> payment_token).
//   - Checkout key ("checkout_public_") -> Gateway.create() for 3-D Secure.
// The private security key is never part of the browser config; it lives only in Supabase secrets.

/** Card payments through BAC are contracted in US dollars only (see BAC_CURRENCY on the server). */
export const BAC_CURRENCY = 'USD';

export interface BacBrowserEnv {
  tokenizationKey?: string;
  checkoutKey?: string;
  gatewayUrl?: string;
}

export interface BacConfig {
  tokenizationKey: string;
  checkoutKey: string;
  gatewayUrl: string;
  isMock: boolean;
  configured: boolean;
}

const TOKENIZATION_KEY = /^[A-Za-z0-9-]{8,64}$/;
const CHECKOUT_KEY = /^checkout_public_[A-Za-z0-9]{8,64}$/;
const GATEWAY_ORIGIN = /^https:\/\/[a-z0-9.-]+$/i;

export function resolveBacConfig(env: BacBrowserEnv): BacConfig {
  const tokenizationKey = env.tokenizationKey?.trim() ?? '';
  const checkoutKey = env.checkoutKey?.trim() ?? '';
  const gatewayUrl = (env.gatewayUrl?.trim() ?? '').replace(/\/+$/, '');
  const isMock = tokenizationKey === 'mock';
  // A swapped or mistyped key would break tokenization or 3DS mid-checkout, so it disables the method up front.
  const configured = isMock || (TOKENIZATION_KEY.test(tokenizationKey) && CHECKOUT_KEY.test(checkoutKey) && GATEWAY_ORIGIN.test(gatewayUrl));
  return { tokenizationKey, checkoutKey, gatewayUrl, isMock, configured };
}
