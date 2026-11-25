import { getConsent } from './consent';

const ATTRIBUTION_KEY = 'pft-attribution-v1';
const ATTRIBUTION_TTL = 30 * 60 * 1000;
const campaignKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
const clickKeys = new Set(['gclid', 'dclid', 'gbraid', 'wbraid', 'fbclid']);
const campaignValue = (value: string) => /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
  && !/email|token|secret|password|\d{7}/i.test(value);
const clickValue = (value: string) => /^[a-z0-9_-]{10,256}$/i.test(value);
let attribution: { at: number; campaigns: Record<string, string>; clicks: Record<string, string>; referrer: string } | undefined;
let attributionExpiry: number | undefined;

function safeReferrer() {
  try {
    const url = new URL(document.referrer);
    return url.protocol === 'https:' && url.origin !== location.origin ? url.origin : '';
  } catch { return ''; }
}
function captureAttribution() {
  const consent = getConsent();
  if (!consent.analytics && !consent.marketing) {
    window.clearTimeout(attributionExpiry);
    attribution = undefined;
    try { sessionStorage.removeItem(ATTRIBUTION_KEY); } catch { /* Optional storage. */ }
    return;
  }
  if (!attribution) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || 'null');
      if (stored?.version === 1 && Number.isFinite(stored.at) && stored.at <= Date.now()
        && Date.now() - stored.at < ATTRIBUTION_TTL) {
        // Re-validate persisted values: browser storage is not a trusted input.
        const campaigns: Record<string, string> = {};
        const clicks: Record<string, string> = {};
        for (const [key, value] of Object.entries(stored.campaigns ?? {})) {
          if (campaignKeys.has(key) && typeof value === 'string' && campaignValue(value)) campaigns[key] = value;
        }
        for (const [key, value] of Object.entries(stored.clicks ?? {})) {
          if (clickKeys.has(key) && typeof value === 'string' && clickValue(value)) clicks[key] = value;
        }
        let referrer = '';
        try {
          const url = new URL(stored.referrer);
          if (url.protocol === 'https:' && url.origin === stored.referrer) referrer = url.origin;
        } catch { /* No referrer. */ }
        attribution = { at: stored.at, campaigns, clicks, referrer };
      }
    } catch { /* Private browsers can block storage. */ }
  }
  if (!attribution || Date.now() - attribution.at >= ATTRIBUTION_TTL) {
    attribution = { at: Date.now(), campaigns: {}, clicks: {}, referrer: safeReferrer() };
  }
  window.clearTimeout(attributionExpiry);
  attributionExpiry = window.setTimeout(() => {
    attribution = undefined;
    try { sessionStorage.removeItem(ATTRIBUTION_KEY); } catch { /* Optional storage. */ }
  }, Math.max(0, ATTRIBUTION_TTL - (Date.now() - attribution.at)));
  const params = new URLSearchParams(location.search);
  for (const [key, value] of params) {
    if (consent.analytics && campaignKeys.has(key) && params.getAll(key).length === 1 && campaignValue(value)) {
      attribution.campaigns[key] = value;
    }
    if (consent.marketing && clickKeys.has(key) && params.getAll(key).length === 1 && clickValue(value)) {
      attribution.clicks[key] = value;
    }
  }
  if (!consent.analytics) { attribution.campaigns = {}; attribution.referrer = ''; }
  if (!consent.marketing) attribution.clicks = {};
  try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...attribution, version: 1 })); } catch { /* Memory fallback. */ }
}
export function measurementAttribution() {
  captureAttribution();
  return { campaigns: { ...attribution?.campaigns }, referrer: attribution?.referrer ?? '' };
}
// Dedicated future server-adapter input. Never spread this into general dataLayer.
export function advertisingAttribution() {
  captureAttribution();
  return getConsent().marketing ? { ...attribution?.clicks } : {};
}
export function metaUrlIsSafe() {
  if (location.hash) return false;
  const params = new URLSearchParams(location.search);
  return [...params].every(([key, value]) => params.getAll(key).length === 1
    && ((campaignKeys.has(key) && campaignValue(value)) || (clickKeys.has(key) && clickValue(value))));
}
window.addEventListener('pft-consent-change', captureAttribution);
