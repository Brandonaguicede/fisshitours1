import { advertisingAttribution } from './attribution';
import { getConsentRecord } from './consent';

export interface BookingAttribution {
  analyticsConsent: boolean;
  marketingConsent: boolean;
  consentRevision: number;
  capturedAt: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbp?: string;
  fbc?: string;
  gaClientId?: string;
  gaSessionId?: string;
}

const SAFE_CLICK_ID = /^[A-Za-z0-9_-]{10,256}$/;
const SAFE_META_COOKIE = /^fb\.\d+\.\d+\.[A-Za-z0-9_-]{1,256}$/;
const SAFE_GA_ID = /^[A-Za-z0-9._-]{1,128}$/;

function cookieValue(name: string) {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (!value.startsWith(prefix)) continue;
    try { return decodeURIComponent(value.slice(prefix.length)); } catch { return undefined; }
  }
  return undefined;
}

function gtagValue(field: 'client_id' | 'session_id') {
  return new Promise<string | undefined>((resolve) => {
    if (typeof window.gtag !== 'function') return resolve(undefined);
    let settled = false;
    const finish = (value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(typeof value === 'string' && SAFE_GA_ID.test(value) ? value : undefined);
    };
    const timeout = window.setTimeout(() => finish(), 500);
    try { window.gtag('get', 'G-KQDFR0ZVPW', field, finish); } catch { finish(); }
  });
}

export async function bookingAttribution(): Promise<BookingAttribution> {
  const consent = getConsentRecord();
  const result: BookingAttribution = {
    analyticsConsent: consent.analytics,
    marketingConsent: consent.marketing,
    consentRevision: consent.revision,
    capturedAt: new Date().toISOString(),
  };

  if (consent.marketing) {
    const clicks = advertisingAttribution();
    for (const key of ['gclid', 'gbraid', 'wbraid'] as const) {
      const value = clicks[key];
      if (typeof value === 'string' && SAFE_CLICK_ID.test(value)) result[key] = value;
    }
    const fbp = cookieValue('_fbp');
    const fbc = cookieValue('_fbc');
    if (fbp && SAFE_META_COOKIE.test(fbp)) result.fbp = fbp;
    if (fbc && SAFE_META_COOKIE.test(fbc)) result.fbc = fbc;
  }

  if (consent.analytics) {
    const [clientId, sessionId] = await Promise.all([gtagValue('client_id'), gtagValue('session_id')]);
    if (clientId) result.gaClientId = clientId;
    if (sessionId) result.gaSessionId = sessionId;
  }
  return result;
}
