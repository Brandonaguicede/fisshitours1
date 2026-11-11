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
  allowMock?: boolean;
}

export interface BacConfig {
  tokenizationKey: string;
  checkoutKey: string;
  gatewayUrl: string;
  isMock: boolean;
  configured: boolean;
}

const TOKENIZATION_KEY = /^[A-Za-z0-9-]{8,64}$/;
// NMI does not document a fixed Checkout key length; BAC validates the key.
const CHECKOUT_KEY = /^checkout_public_[A-Za-z0-9]+$/;
const GATEWAY_ORIGIN = /^https:\/\/[a-z0-9.-]+$/i;
// Collect.js / Gateway.js run on the payment page, so they may only come from a BAC/NMI host
// (keep in sync with GATEWAY_HOST_SUFFIXES in supabase/functions/_shared/bac-gateway.ts).
const GATEWAY_HOST_SUFFIXES = ['nmi.com', 'compassmerchantsolutions.com', 'credomatic.com'];

export function isAllowedGatewayOrigin(origin: string): boolean {
  if (!GATEWAY_ORIGIN.test(origin)) return false;
  const host = origin.slice('https://'.length).toLowerCase();
  return GATEWAY_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function resolveBacConfig(env: BacBrowserEnv): BacConfig {
  const tokenizationKey = env.tokenizationKey?.trim() ?? '';
  const checkoutKey = env.checkoutKey?.trim() ?? '';
  const gatewayUrl = (env.gatewayUrl?.trim() ?? '').replace(/\/+$/, '');
  const isMock = env.allowMock === true && tokenizationKey === 'mock';
  // A swapped or mistyped key would break tokenization or 3DS mid-checkout, so it disables the method up front.
  const configured = isMock || (TOKENIZATION_KEY.test(tokenizationKey) && CHECKOUT_KEY.test(checkoutKey) && isAllowedGatewayOrigin(gatewayUrl));
  return { tokenizationKey, checkoutKey, gatewayUrl, isMock, configured };
}
