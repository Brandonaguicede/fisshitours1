export interface CanonicalServerPurchase {
  transactionId: string;
  occurredAt: string;
  value: number;
  currency: 'USD';
  analyticsConsent: boolean;
  marketingConsent: boolean;
  gaClientId?: string | null;
  gaSessionId?: string | null;
  email?: string | null;
  phone?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
}

export interface DeliveryResult {
  accepted: boolean;
  retryable: boolean;
  status: number;
  receipt?: string;
  errorCode?: string;
}

const TRANSACTION_ID = /^[a-f0-9]{64}$/;
const CLIENT_ID = /^[0-9]+\.[0-9]+$/;
const SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/;
const META_COOKIE = /^fb\.[0-9]+\.[0-9]+\.[A-Za-z0-9_-]{1,256}$/;
const GOOGLE_CLICK_ID = /^[A-Za-z0-9_-]{10,256}$/;

function eventTime(input: CanonicalServerPurchase, maxAgeHours: number) {
  if (!TRANSACTION_ID.test(input.transactionId) || !Number.isFinite(input.value) || input.value <= 0 || input.currency !== 'USD') {
    throw new Error('INVALID_PURCHASE');
  }
  const milliseconds = Date.parse(input.occurredAt);
  const age = Date.now() - milliseconds;
  if (!Number.isFinite(milliseconds) || age < -5 * 60_000 || age > maxAgeHours * 3_600_000) throw new Error('EVENT_TIME_OUT_OF_RANGE');
  return milliseconds;
}

export function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.length <= 254 ? normalized : null;
}

export function normalizePhone(value?: string | null) {
  const digits = value?.trim().replace(/\D/g, '') ?? '';
  const withCountry = digits.length === 8 ? `506${digits}` : digits;
  return /^[1-9][0-9]{7,14}$/.test(withCountry) ? `+${withCountry}` : null;
}

export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function buildGa4Purchase(input: CanonicalServerPurchase) {
  if (!input.analyticsConsent) throw new Error('ANALYTICS_CONSENT_REQUIRED');
  const occurredAt = eventTime(input, 72);
  if (!input.gaClientId || !CLIENT_ID.test(input.gaClientId)) throw new Error('GA_CLIENT_ID_REQUIRED');
  if (input.gaSessionId && !SESSION_ID.test(input.gaSessionId)) throw new Error('INVALID_GA_SESSION_ID');
  return {
    client_id: input.gaClientId,
    timestamp_micros: occurredAt * 1000,
    consent: {
      ad_user_data: input.marketingConsent ? 'GRANTED' : 'DENIED',
      ad_personalization: input.marketingConsent ? 'GRANTED' : 'DENIED',
    },
    events: [{ name: 'purchase', params: {
      transaction_id: input.transactionId,
      currency: input.currency,
      value: input.value,
      ...(input.gaSessionId ? { session_id: input.gaSessionId, engagement_time_msec: 1 } : {}),
    } }],
  };
}

export async function buildMetaPurchase(input: CanonicalServerPurchase, eventSourceUrl: string, maxAgeHours = 168) {
  if (!input.marketingConsent) throw new Error('MARKETING_CONSENT_REQUIRED');
  const occurredAt = eventTime(input, maxAgeHours);
  const source = new URL(eventSourceUrl);
  if (source.protocol !== 'https:' || !['papagayofishingtourcr.com', 'www.papagayofishingtourcr.com'].includes(source.hostname)) {
    throw new Error('INVALID_EVENT_SOURCE_URL');
  }
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const userData: Record<string, string[]> = {};
  if (email) userData.em = [await sha256(email)];
  if (phone) userData.ph = [await sha256(phone.replace(/^\+/, ''))];
  if (input.fbp && META_COOKIE.test(input.fbp)) userData.fbp = [input.fbp];
  if (input.fbc && META_COOKIE.test(input.fbc)) userData.fbc = [input.fbc];
  if (!Object.keys(userData).length) throw new Error('META_MATCH_DATA_REQUIRED');
  return { data: [{
    event_name: 'Purchase',
    event_time: Math.floor(occurredAt / 1000),
    event_id: input.transactionId,
    action_source: 'website',
    event_source_url: source.toString(),
    user_data: userData,
    custom_data: { currency: input.currency, value: input.value },
  }] };
}

export function buildGoogleAdsDataManagerPurchase(input: CanonicalServerPurchase, config: {
  customerId: string;
  conversionActionId: string;
  loginCustomerId?: string;
  validateOnly: boolean;
}) {
  if (!input.marketingConsent) throw new Error('MARKETING_CONSENT_REQUIRED');
  eventTime(input, 24 * 90);
  const customerId = config.customerId.replace(/-/g, '');
  const loginCustomerId = config.loginCustomerId?.replace(/-/g, '');
  if (!/^[0-9]{6,20}$/.test(customerId) || !/^[0-9]{1,30}$/.test(config.conversionActionId)
      || (loginCustomerId && !/^[0-9]{6,20}$/.test(loginCustomerId))) throw new Error('GOOGLE_ADS_DESTINATION_REQUIRED');
  const adIdentifiers = Object.fromEntries([
    ['gclid', input.gclid], ['gbraid', input.gbraid], ['wbraid', input.wbraid],
  ].filter((entry): entry is [string, string] => Boolean(entry[1] && GOOGLE_CLICK_ID.test(entry[1]))));
  if (!Object.keys(adIdentifiers).length) throw new Error('GOOGLE_CLICK_ID_REQUIRED');
  return {
    destinations: [{
      reference: 'purchase',
      operatingAccount: { accountId: customerId, accountType: 'GOOGLE_ADS' },
      ...(loginCustomerId ? { loginAccount: { accountId: loginCustomerId, accountType: 'GOOGLE_ADS' } } : {}),
      productDestinationId: config.conversionActionId,
    }],
    events: [{
      destinationReferences: ['purchase'], transactionId: input.transactionId,
      eventTimestamp: new Date(input.occurredAt).toISOString(),
      consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_GRANTED' },
      adIdentifiers, currency: input.currency, eventSource: 'WEB', conversionValue: input.value, conversionCount: 1,
    }],
    validateOnly: config.validateOnly,
  };
}

export async function sendGa4Purchase(input: CanonicalServerPurchase, config: {
  measurementId: string;
  apiSecret: string;
  validateOnly?: boolean;
  fetcher?: typeof fetch;
}): Promise<DeliveryResult> {
  if (!/^G-[A-Z0-9]{6,20}$/.test(config.measurementId) || !config.apiSecret) throw new Error('GA4_CONFIG_REQUIRED');
  const path = config.validateOnly ? '/debug/mp/collect' : '/mp/collect';
  const url = new URL(path, 'https://www.google-analytics.com');
  url.searchParams.set('measurement_id', config.measurementId);
  url.searchParams.set('api_secret', config.apiSecret);
  const response = await (config.fetcher ?? fetch)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildGa4Purchase(input)) });
  if (!response.ok) return { accepted: false, retryable: response.status === 429 || response.status >= 500, status: response.status, errorCode: 'GA4_HTTP_ERROR' };
  if (config.validateOnly) {
    const validation = await response.json().catch(() => ({ validationMessages: [{ validationCode: 'INVALID_RESPONSE' }] })) as { validationMessages?: Array<{ validationCode?: string }> };
    const first = validation.validationMessages?.[0]?.validationCode;
    return { accepted: !first, retryable: false, status: response.status, ...(first ? { errorCode: first } : {}) };
  }
  return { accepted: true, retryable: false, status: response.status };
}

export async function sendMetaPurchase(input: CanonicalServerPurchase, config: {
  datasetId: string;
  accessToken: string;
  graphVersion: string;
  eventSourceUrl: string;
  testEventCode?: string;
  fetcher?: typeof fetch;
}): Promise<DeliveryResult> {
  if (!/^[0-9]{10,30}$/.test(config.datasetId) || !/^v[0-9]+\.[0-9]+$/.test(config.graphVersion) || !config.accessToken) throw new Error('META_CONFIG_REQUIRED');
  const body = await buildMetaPurchase(input, config.eventSourceUrl);
  const response = await (config.fetcher ?? fetch)(`https://graph.facebook.com/${config.graphVersion}/${config.datasetId}/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: config.accessToken, ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}) }),
  });
  const result = await response.json().catch(() => ({})) as { events_received?: number; fbtrace_id?: string; error?: { code?: number; is_transient?: boolean } };
  const accepted = response.ok && result.events_received === 1;
  return {
    accepted,
    retryable: !accepted && (response.status === 429 || response.status >= 500 || result.error?.is_transient === true),
    status: response.status,
    ...(accepted && result.fbtrace_id ? { receipt: result.fbtrace_id } : {}),
    ...(!accepted ? { errorCode: result.error?.code ? `META_${result.error.code}` : 'META_REJECTED' } : {}),
  };
}
