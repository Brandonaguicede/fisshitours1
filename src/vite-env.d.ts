/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PAYPAL_CLIENT_ID?: string;
  /** BAC/NMI public (checkout) key. Never put the private security key in a VITE_ variable. */
  readonly VITE_BAC_PUBLIC_KEY?: string;
  /** BAC gateway origin that serves Collect.js and Gateway.js, e.g. https://<host provided by BAC>. */
  readonly VITE_BAC_GATEWAY_URL?: string;
  readonly VITE_WHATSAPP_NUMBER?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_DISABLE_TURNSTILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
