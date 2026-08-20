export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export const USE_LOCAL_TURNSTILE_MOCK = import.meta.env.DEV && (!TURNSTILE_SITE_KEY || TURNSTILE_SITE_KEY === 'mock');

export const MOCK_TURNSTILE_TOKEN = 'mock-valid-turnstile';