import { getConsent, marketingEnabled, consentIsApplied, loadConsentedGtm } from './consent';
import { safePath, isMeasurementPath } from './routes';
import { measurementAttribution, metaUrlIsSafe } from './attribution';
export { safePath } from './routes';

export interface MeasurementReceipt {
  booking_id: string;
  transaction_id?: string;
  currency?: string;
  value?: number;
  booking_confirmed: boolean;
  payment_confirmed: boolean;
  production: boolean;
}
type EventName = 'page_view_spa' | 'view_item_list' | 'view_item' | 'begin_checkout' | 'add_payment_info' | 'purchase'
  | 'whatsapp_click' | 'reservation_submit_success' | 'booking_confirmed' | 'contact_submit_success' | 'whatsapp_open_attempt';
export interface EcommerceItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
  index?: number;
}
export interface CommerceContext {
  currency: string;
  value: number;
  tax?: number;
  items: EcommerceItem[];
}
interface Fields {
  booking_id?: string;
  transaction_id?: string;
  currency?: string;
  value?: number;
  page_path?: string;
  page_title?: string;
  ecommerce?: object;
}
const EVENT_TTL = 30 * 60 * 1000;
interface PendingEvent { payload: Record<string, unknown>; at: number; emitted: boolean }
const generated = new Map<string, PendingEvent>();
function pruneEvents() {
  for (const [id, entry] of generated) if (Date.now() - entry.at >= EVENT_TTL) generated.delete(id);
}
function flushEvents() {
  pruneEvents();
  if (!consentIsApplied() || !isMeasurementPath(location.pathname)) return;
  const consent = getConsent();
  for (const entry of generated.values()) {
    if (entry.emitted) continue;
    // Retain only permissions held both when generated and when emitted. Never replay for a newly granted category.
    const analytics = entry.payload.analytics_consent === true && consent.analytics;
    const marketing = entry.payload.marketing_consent === true && consent.marketing;
    if (!analytics && !marketing) continue;
    if (!analytics) {
      for (const key of ['campaign_source', 'campaign_medium', 'campaign_name', 'campaign_content', 'campaign_term']) entry.payload[key] = null;
      entry.payload.page_referrer = '';
    }
    window.dataLayer = window.dataLayer || [];
    if (entry.payload.ecommerce) window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({ ...entry.payload, analytics_consent: analytics, marketing_consent: marketing });
    entry.emitted = true; // Enqueued ONLY. This is not a tag or provider acknowledgement.
  }
}
window.addEventListener('pft-consent-applied', () => {
  // A sandboxed GTM template invokes this callback while GTM is still
  // processing its current dataLayer entry. Defer our push one task so it is
  // observed as the next entry, never nested inside consent initialization.
  window.setTimeout(() => {
    trackPage(location.pathname);
    flushEvents();
  }, 0);
});
window.addEventListener('online', () => { loadConsentedGtm(); flushEvents(); });
window.addEventListener('pft-consent-change', () => {
  const consent = getConsent();
  for (const [id, entry] of generated) {
    if (!consent.analytics) entry.payload.analytics_consent = false;
    if (!consent.marketing) entry.payload.marketing_consent = false;
    if (!entry.payload.analytics_consent && !entry.payload.marketing_consent) generated.delete(id);
  }
  flushEvents();
});
let lastPage = '';
let pageSequence = 0;
function emit(event: EventName, fields: Fields = {}, key?: string) {
  try {
  const consent = getConsent();
  if (!consent.analytics && !consent.marketing) return;
  if (!isMeasurementPath(location.pathname)) return;
  pruneEvents();
  const marker = key ? `${event}:${key}` : crypto.randomUUID();
  if (generated.has(marker)) { flushEvents(); return; }
  // Explicit allowlist: never spread a booking, response, form or URL into dataLayer.
  const attribution = measurementAttribution();
  const payload: Record<string, unknown> = {
    event, event_id: marker,
    page_path: safePath(location.pathname),
    page_location: location.origin + safePath(location.pathname),
    page_referrer: attribution.referrer, // Origin only; never path, query or hash.
    campaign_source: attribution.campaigns.utm_source ?? null,
    campaign_medium: attribution.campaigns.utm_medium ?? null,
    campaign_name: attribution.campaigns.utm_campaign ?? null,
    campaign_content: attribution.campaigns.utm_content ?? null,
    campaign_term: attribution.campaigns.utm_term ?? null,
    analytics_consent: consent.analytics, marketing_consent: consent.marketing,
    meta_url_safe: metaUrlIsSafe(),
    measurement_environment: marketingEnabled() ? 'production' : 'test',
    booking_id: null, transaction_id: null, currency: null, value: null,
  };
  for (const field of ['booking_id', 'transaction_id', 'currency', 'value', 'page_path', 'page_title', 'ecommerce'] as const) {
    if (fields[field] !== undefined) payload[field] = fields[field];
  }
  generated.set(marker, { payload, at: Date.now(), emitted: false });
  window.setTimeout(() => generated.delete(marker), EVENT_TTL);
  if (generated.size > 200) generated.delete(generated.keys().next().value!);
  flushEvents();
  } catch { /* Marketing failure must never interrupt checkout or navigation. */ }
}
export function trackPage(path: string) {
  if (!isMeasurementPath(path)) { lastPage = ''; return; }
  const canonical = safePath(path);
  if (lastPage === canonical) return;
  if (!getConsent().analytics && !getConsent().marketing) return;
  lastPage = canonical;
  emit('page_view_spa', { page_path: canonical, page_title: document.title }, `${canonical}:${++pageSequence}`);
}
function validItem(item: EcommerceItem) {
  return Boolean(item.item_id && item.item_name && (item.price === undefined || (Number.isFinite(item.price) && item.price >= 0)));
}
function validCommerce(context: CommerceContext) {
  return /^[A-Z]{3}$/.test(context.currency) && Number.isFinite(context.value) && context.value >= 0
    && context.items.length > 0 && context.items.every(validItem);
}
export function trackItemList(listName: string, items: EcommerceItem[], key: string) {
  const cleanItems = items.filter(validItem).map((item, index) => ({ ...item, index: item.index ?? index }));
  if (!listName || !cleanItems.length) return;
  emit('view_item_list', { ecommerce: { item_list_name: listName, items: cleanItems } }, key);
}
export function trackViewItem(item: EcommerceItem, key: string) {
  if (!validItem(item)) return;
  const hasPrice = Number.isFinite(item.price);
  emit('view_item', { ecommerce: {
    ...(hasPrice ? { currency: 'USD', value: item.price } : {}),
    items: [{ ...item, quantity: item.quantity ?? 1 }],
  } }, key);
}
export function trackBeginCheckout(context: CommerceContext, key: string) {
  if (!validCommerce(context)) return;
  emit('begin_checkout', { ecommerce: context }, key);
}
export function trackAddPaymentInfo(context: CommerceContext, paymentType: string, key: string) {
  if (!validCommerce(context) || !paymentType) return;
  emit('add_payment_info', { ecommerce: { ...context, payment_type: paymentType } }, key);
}
export function trackWhatsApp(href: string, kind: 'click' | 'open_attempt' = 'click') {
  try {
    const url = new URL(href, location.origin);
    const number = url.hostname === 'wa.me' ? url.pathname.slice(1) : url.searchParams.get('phone');
    if ((url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com' || url.protocol === 'whatsapp:')
      && number?.replace(/\D/g, '') === '50686105784') emit(kind === 'click' ? 'whatsapp_click' : 'whatsapp_open_attempt');
  } catch { /* Ignore unrelated links. */ }
}
export function trackContact() { emit('contact_submit_success'); }
export function trackReservation(receipt?: MeasurementReceipt, commerce?: CommerceContext) {
  if (!receipt || typeof receipt.booking_id !== 'string' || !receipt.booking_id) return;
  if (marketingEnabled() && receipt.production !== true) return;
  emit('reservation_submit_success', { booking_id: receipt.booking_id }, receipt.booking_id);
  trackVerifiedResult(receipt, commerce);
}
export function trackVerifiedResult(receipt?: MeasurementReceipt, commerce?: CommerceContext) {
  if (!receipt || typeof receipt.booking_id !== 'string' || !receipt.booking_id) return;
  // On a live site test/sandbox responses are never converted into sales.
  if (marketingEnabled() && receipt.production !== true) return;
  const fields = { booking_id: receipt.booking_id };
  if (receipt.booking_confirmed === true) emit('booking_confirmed', fields, receipt.booking_id);
  if (receipt.payment_confirmed === true && receipt.transaction_id && /^[A-Z]{3}$/.test(receipt.currency ?? '')
    && Number.isFinite(receipt.value) && receipt.value! > 0 && commerce && validCommerce(commerce)) {
    emit('purchase', { ...fields, transaction_id: receipt.transaction_id, currency: receipt.currency, value: receipt.value,
      ecommerce: { ...commerce, currency: receipt.currency, value: receipt.value, transaction_id: receipt.transaction_id } }, receipt.transaction_id);
  }
}
