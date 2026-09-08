/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PAYPAL_CLIENT_ID?: string;
  readonly VITE_WHATSAPP_NUMBER?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_DISABLE_TURNSTILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
