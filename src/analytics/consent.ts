import { isMeasurementPath, normalizePath } from './routes';

export interface Consent { analytics: boolean; marketing: boolean }
export const CONSENT_KEY = 'pft-consent-v2';
const MAX_AGE = 180 * 86400000;
const denied: Consent = { analytics: false, marketing: false };
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
    pftLoadGtm?: () => Promise<boolean>;
    pftReadConsent?: () => Consent & { revision: number };
    pftConsentApplied?: (revision: number) => void;
    fbq?: (...args: unknown[]) => void;
  }
}
export function storedConsent(): Consent | null {
  try {
    const value = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    if (value?.version === 2 && typeof value.analytics === 'boolean' && typeof value.marketing === 'boolean'
      && Number.isFinite(value.at) && value.at <= Date.now() && Date.now() - value.at < MAX_AGE) {
      return { analytics: value.analytics, marketing: value.marketing };
    }
  } catch { /* Storage can be disabled on mobile/private browsers. */ }
  return null;
}
let current = storedConsent() ?? denied;
let revision = 0;
let appliedRevision = -1;
let announcedRevision = -1;
let gtmLoaded = false;
export const getConsent = (): Consent => ({ ...current });
export const getConsentRecord = (): Consent & { revision: number } => ({ ...current, revision });
export function marketingEnabled() {
  const productionHost = ['papagayofishingtourcr.com', 'www.papagayofishingtourcr.com'].includes(location.hostname);
  const previewHost = import.meta.env.VITE_MARKETING_PREVIEW_ENABLED === 'true'
    && location.hostname.endsWith('.vercel.app');
  return import.meta.env.PROD && import.meta.env.VITE_MARKETING_ENABLED === 'true'
    && import.meta.env.VITE_GTM_CONTAINER_REVIEWED === 'true'
    && (productionHost || previewHost);
}
export const consentIsApplied = () => !marketingEnabled() || appliedRevision === revision;
window.pftReadConsent = () => ({ ...current, revision });
// Called ONLY by the reviewed GTM sandboxed consent template after updateConsentState.
window.pftConsentApplied = (value: number) => {
  if (value !== revision) return;
  appliedRevision = value;
  window.dispatchEvent(new Event('pft-consent-applied'));
};
export function loadConsentedGtm() {
  if (!marketingEnabled() || !isMeasurementPath(location.pathname)) return;
  const expectedRevision = revision;
  const announce = () => {
    if (expectedRevision !== revision || announcedRevision === expectedRevision) return;
    announcedRevision = expectedRevision;
    window.dataLayer?.push({ event: 'consent_updated', consent_revision: expectedRevision,
      analytics_consent: current.analytics, marketing_consent: current.marketing });
  };
  // Once GTM exists, revocations must reach its consent template even though no
  // category remains granted. Before the first grant there is intentionally no
  // external container to notify.
  if (!current.analytics && !current.marketing) {
    if (gtmLoaded) announce();
    return;
  }
  window.gtag?.('set', { page_location: location.origin + normalizePath(location.pathname), page_referrer: '', send_page_view: false });
  void window.pftLoadGtm?.().then((loaded) => {
    if (!loaded) return;
    gtmLoaded = true;
    announce();
  }).catch(() => { /* External measurement must not affect the site. */ });
}
function removeMarketingCookies() {
  // Only measurement cookies: never touch auth, BAC, NMI, PayPal or booking storage.
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0].trim();
    const analyticsCookie = /^(_ga(?:_|$)|_gid$|_gat)/.test(name);
    const advertisingCookie = /^(_gcl_|_gac_|_fbp$|_fbc$)/.test(name);
    if (!((!current.analytics && analyticsCookie) || (!current.marketing && advertisingCookie))) continue;
    const parts = location.hostname.split('.');
    const domains = ['', ...parts.map((_, i) => '.' + parts.slice(i).join('.'))];
    const paths = ['/', ...location.pathname.split('/').filter(Boolean).map((_, i, all) => '/' + all.slice(0, i + 1).join('/'))];
    for (const domain of domains) for (const path of paths) {
      document.cookie = `${name}=; Max-Age=0; Path=${path}; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
    }
  }
}
export function applyConsent(choice: Consent, persist = true) {
  current = { analytics: choice.analytics === true, marketing: choice.marketing === true };
  revision++;
  appliedRevision = -1;
  if (persist) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ ...current, version: 2, at: Date.now() })); } catch { /* In-memory choice still works. */ }
  }
  // No queued gtag consent updates: the GTM template uses synchronous consent APIs.
  window.fbq?.('consent', current.marketing ? 'grant' : 'revoke');
  if (!current.analytics || !current.marketing) removeMarketingCookies();
  loadConsentedGtm();
  // Remove indefinite dedupe records written by the previous implementation only.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('pft-event:')) localStorage.removeItem(key);
    }
  } catch { /* Storage can be blocked. */ }
  window.dispatchEvent(new Event('pft-consent-change'));
}
export function initializeConsent() {
  applyConsent(current, false);
  window.addEventListener('storage', (event) => {
    if (event.key === CONSENT_KEY || event.key === null) applyConsent(storedConsent() ?? denied, false);
  });
}
