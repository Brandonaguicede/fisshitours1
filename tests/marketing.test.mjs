import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loadTs, plain } from './support/load-ts.mjs';

function browser({ production = false, blockedStorage = false } = {}) {
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const storage = new Map();
  const listeners = new Map();
  const window = { dataLayer: [], gtag(...args) {
    if (args[0] === 'get' && typeof args[3] === 'function') {
      args[3](args[2] === 'client_id' ? '123456789.987654321' : '1794609108');
      return;
    }
    this.dataLayer.push(args);
  },
    setTimeout() { return 1; }, clearTimeout() {},
    dispatchEvent(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
    addEventListener(name, fn) { listeners.set(name, [...(listeners.get(name) ?? []), fn]); },
    pftLoadGtm() { this.loaded = (this.loaded ?? 0) + 1; return Promise.resolve(true); } };
  const context = vm.createContext({ window, crypto: globalThis.crypto, Event,
    location: { hostname: 'papagayofishingtourcr.com', pathname: '/reservar', search: '', hash: '', origin: 'https://papagayofishingtourcr.com' },
    document: { cookie: '', referrer: '', title: 'Booking' }, URL, URLSearchParams, sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }, Date: Clock, setTimeout, clearTimeout,
    localStorage: { getItem(k) { if (blockedStorage) throw Error(); return storage.get(k) ?? null; },
      setItem(k, v) { if (blockedStorage) throw Error(); storage.set(k, v); },
      get length() { return storage.size; }, key(i) { return [...storage.keys()][i] ?? null; }, removeItem(k) { storage.delete(k); } },
  });
  for (const file of ['routes', 'consent', 'attribution', 'bookingAttribution', 'events', 'enhancedConversions']) {
    const source = fs.readFileSync(`src/analytics/${file}.ts`, 'utf8')
      .replace(/^import .*;\r?\n/gm, '').replace(/^export \{.*\}[^\n]*\n/gm, '').replace(/^export /gm, '')
      .replace(/import\.meta\.env\.PROD/g, String(production))
      .replace(/import\.meta\.env\.VITE_\w+/g, "'true'");
    vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context);
  }
  return { context, window, storage, advance: ms => { now += ms; },
    events: () => window.dataLayer.filter(e => e.event && e.event !== 'consent_updated') };
}

test('no events or GTM before consent; reject persists and route events dedupe', () => {
  const b = browser(); const c = b.context;
  c.initializeConsent(); c.trackPage('/reservar'); c.trackViewItem({ item_id: 'boat-1', item_name: 'Second Wind' }, 'boat-1');
  assert.equal(b.events().length, 0); assert.equal(b.window.loaded, undefined);
  c.applyConsent({ analytics: false, marketing: false });
  assert.equal(JSON.parse(b.storage.get('pft-consent-v2')).marketing, false);
  c.applyConsent({ analytics: true, marketing: false });
  c.trackPage('/reservar'); c.trackPage('/reservar'); c.trackPage('/tours'); c.trackPage('/reservar');
  assert.equal(b.events().filter(e => e.event === 'page_view_spa').length, 3);
  assert.equal(b.window.loaded, undefined); // Local QA never loads a real container.
  assert.equal(vm.runInContext("safePath('/customer@example.com')", c), '/not-found');
});

test('live events wait for the matching consent acknowledgement; no persistent delivery claim', () => {
  const b = browser({ production: true }); const c = b.context;
  c.applyConsent({ analytics: true, marketing: false });
  c.trackReservation({ booking_id: 'booking-1', production: true });
  assert.equal(b.events().length, 0);
  const original = b.window.pftReadConsent().revision;
  c.applyConsent({ analytics: true, marketing: true });
  b.window.pftConsentApplied(original); // stale acknowledgement cannot release anything
  assert.equal(b.events().length, 0);
  b.window.pftConsentApplied(b.window.pftReadConsent().revision);
  assert.equal(b.events().length, 1);
  assert.equal(b.events()[0].analytics_consent, true);
  assert.equal(b.events()[0].marketing_consent, false); // no retroactive advertising
  c.trackReservation({ booking_id: 'booking-1', production: true });
  assert.equal(b.events().length, 1);
  assert.equal([...b.storage.keys()].filter(k => k.startsWith('pft-event:')).length, 0);
});

test('each live consent revision is announced once after GTM loads, including withdrawal', async () => {
  const b = browser({ production: true }); const c = b.context;
  const updates = () => b.window.dataLayer.filter(entry => entry.event === 'consent_updated');

  c.initializeConsent();
  assert.equal(updates().length, 0, 'denied-by-default must not load or notify an absent container');

  c.applyConsent({ analytics: true, marketing: true });
  c.loadConsentedGtm(); // Mirrors the route observer racing with applyConsent.
  await Promise.resolve(); await Promise.resolve();
  assert.equal(updates().length, 1);
  assert.equal(updates()[0].consent_revision, b.window.pftReadConsent().revision);

  c.loadConsentedGtm();
  await Promise.resolve();
  assert.equal(updates().length, 1, 'repeated loaders must not announce the same revision');

  c.applyConsent({ analytics: false, marketing: false });
  assert.equal(updates().length, 2, 'a loaded container must receive withdrawal');
  assert.equal(updates()[1].analytics_consent, false);
  assert.equal(updates()[1].marketing_consent, false);
});

test('the initial route remains idempotent when consent acknowledgement retries tracking', () => {
  const b = browser({ production: true }); const c = b.context;
  c.applyConsent({ analytics: true, marketing: true });
  c.trackPage('/reservar');
  b.window.pftConsentApplied(b.window.pftReadConsent().revision);
  c.trackPage('/reservar'); // AnalyticsObserver retries on pft-consent-applied.
  assert.equal(b.events().filter(entry => entry.event === 'page_view_spa').length, 1);
});

test('withdrawal drops pending conversions, expiry discards undelivered events and stable IDs survive reload', () => {
  const b = browser({ production: true }); const c = b.context;
  const receipt = { booking_id: 'stable', production: true };
  c.applyConsent({ analytics: true, marketing: true });
  c.trackReservation(receipt);
  c.applyConsent({ analytics: false, marketing: false });
  c.applyConsent({ analytics: true, marketing: true });
  b.window.pftConsentApplied(b.window.pftReadConsent().revision);
  assert.equal(b.events().length, 0);
  c.trackReservation(receipt); // fresh backend result, not an automatic replay
  assert.equal(b.events()[0].event_id, 'reservation_submit_success:stable');
  const reloaded = browser();
  reloaded.context.applyConsent({ analytics: true, marketing: false });
  reloaded.context.trackReservation(receipt);
  assert.equal(reloaded.events()[0].event_id, b.events()[0].event_id);
  c.applyConsent({ analytics: true, marketing: true });
  c.trackReservation({ booking_id: 'expires', production: true });
  b.advance(30 * 60 * 1000 + 1);
  b.window.pftConsentApplied(b.window.pftReadConsent().revision);
  assert.equal(b.events().filter(e => e.booking_id === 'expires').length, 0);
});

test('verified settlement only; authorization, cancelled, zero, sandbox and repeats cannot create purchases', () => {
  const b = browser({ production: true }); const c = b.context;
  c.applyConsent({ analytics: true, marketing: true });
  b.window.pftConsentApplied(b.window.pftReadConsent().revision);
  const receipt = { booking_id: 'opaque-booking', transaction_id: 'opaque-transaction', currency: 'USD', value: 125,
    production: true, payment_confirmed: false, booking_confirmed: false };
  const commerce = { currency: 'USD', value: 125, tax: 13, items: [{ item_id: 'package-1', item_name: 'Fishing', price: 112, quantity: 1 }] };
  c.trackVerifiedResult(receipt, commerce);
  c.trackVerifiedResult({ ...receipt, payment_confirmed: true, value: 0 }, commerce);
  c.trackVerifiedResult({ ...receipt, payment_confirmed: true, production: false }, commerce);
  assert.equal(b.events().length, 0);
  c.trackVerifiedResult({ ...receipt, payment_confirmed: true, booking_confirmed: true, email: 'private@example.com', paymentToken: 'secret' }, commerce);
  c.trackVerifiedResult({ ...receipt, payment_confirmed: true, booking_confirmed: true }, commerce);
  assert.equal(b.events().filter(e => e.event === 'purchase').length, 1);
  assert.equal(b.events().filter(e => e.event === 'booking_confirmed').length, 1);
  assert.equal(b.events().find(e => e.event === 'purchase').ecommerce.value, 125);
  assert.doesNotMatch(JSON.stringify(b.events()), /private|secret|email|paymentToken/);
  c.applyConsent({ analytics: false, marketing: false }); c.trackContact();
  assert.equal(b.events().length, 2);
});

test('GA4 ecommerce contract emits the six events with a clean object and real values', () => {
  const b = browser(); const c = b.context;
  c.applyConsent({ analytics: true, marketing: true });
  const item = { item_id: 'package-1', item_name: 'Half Day Fishing', item_category: 'Fishing',
    item_variant: 'Second Wind', price: 600, quantity: 1 };
  const commerce = { currency: 'USD', value: 678, tax: 78, items: [item] };
  c.trackPage('/reservar');
  c.trackItemList('All tours', [item], 'catalog');
  c.trackViewItem(item, 'package-1');
  c.trackBeginCheckout(commerce, 'checkout-1');
  c.trackBeginCheckout({ ...commerce, value: commerce.value + 10 }, 'checkout-1');
  c.trackAddPaymentInfo(commerce, 'PayPal', 'paypal-1');
  c.trackVerifiedResult({ booking_id: 'booking-1', transaction_id: 'transaction-1', currency: 'USD', value: 678,
    production: true, payment_confirmed: true, booking_confirmed: true }, commerce);
  for (const name of ['page_view_spa', 'view_item_list', 'view_item', 'begin_checkout', 'add_payment_info', 'purchase']) {
    assert.equal(b.events().filter(event => event.event === name).length, 1, name);
  }
  const ecommerceNames = ['view_item_list', 'view_item', 'begin_checkout', 'add_payment_info', 'purchase'];
  for (const name of ecommerceNames) {
    const index = b.window.dataLayer.findIndex(event => event.event === name);
    assert.deepEqual(plain(b.window.dataLayer[index - 1]), { ecommerce: null }, `${name} must clear ecommerce`);
  }
  const purchase = b.events().find(event => event.event === 'purchase');
  assert.equal(purchase.ecommerce.transaction_id, 'transaction-1');
  assert.equal(purchase.ecommerce.value, 678);
  assert.equal(purchase.ecommerce.tax, 78);
  assert.equal(purchase.ecommerce.items[0].item_id, 'package-1');
});

test('storage failures do not break events; WhatsApp strips message and unrelated numbers', () => {
  const b = browser({ blockedStorage: true }); const c = b.context;
  c.applyConsent({ analytics: true, marketing: false });
  c.trackWhatsApp('https://wa.me/50686105784?text=private@example.com');
  c.trackWhatsApp('https://wa.me/50688888888?text=secret');
  c.trackReservation({ booking_id: 'opaque', production: true });
  c.trackReservation({ booking_id: 'opaque', production: true });
  assert.equal(b.events().filter(e => e.event === 'whatsapp_click').length, 1);
  assert.equal(b.events().filter(e => e.event === 'reservation_submit_success').length, 1);
  assert.doesNotMatch(JSON.stringify(b.events()), /private|secret|50686105784/);
});

test('enhanced conversions are separate, consent gated, short lived and cleared on revocation', () => {
  const b = browser(); const c = b.context;
  c.stageEnhancedConversionEmail('private@example.com');
  assert.equal(b.window.pftEnhancedConversionEmail, undefined);
  c.applyConsent({ analytics: false, marketing: true });
  c.stageEnhancedConversionEmail('private@example.com');
  assert.equal(b.window.pftEnhancedConversionEmail(), 'private@example.com');
  assert.doesNotMatch(JSON.stringify(b.window.dataLayer), /private@example/);
  c.applyConsent({ analytics: false, marketing: false });
  assert.equal(b.window.pftEnhancedConversionEmail, undefined);
});

test('cookie withdrawal removes only the denied category and never payment or auth cookies', () => {
  const b = browser(); const c = b.context;
  const removed = [];
  Object.defineProperty(c.document, 'cookie', {
    get: () => '_ga=analytics; _fbp=marketing; bac_session=payment; sb-auth-token=auth',
    set: value => removed.push(value.split('=')[0]),
  });
  c.applyConsent({ analytics: true, marketing: false });
  assert.ok(removed.includes('_fbp'));
  assert.ok(!removed.includes('_ga'));
  assert.ok(!removed.includes('bac_session'));
  assert.ok(!removed.includes('sb-auth-token'));
  removed.length = 0;
  c.applyConsent({ analytics: false, marketing: true });
  assert.ok(removed.includes('_ga'));
  assert.ok(!removed.includes('_fbp'));
});

test('backend receipts use opaque stable IDs, actual captured amount and fail closed for test mode', async () => {
  const env = { APP_ENV: 'production', MARKETING_MEASUREMENT_ENABLED: 'true', BAC_LIVE_PAYMENTS_VERIFIED: 'true' };
  const c = loadTs('supabase/functions/_shared/measurement.ts', vm.createContext({ crypto: globalThis.crypto, TextEncoder, Deno: { env: { get: k => env[k] } } }));
  const input = { bookingId: 'operational-uuid', bookingStatus: 'confirmed', paymentStatus: 'paid', transactionId: 'gateway-secret-id', amount: '75.25', currency: 'USD', provider: 'bac' };
  const first = plain(await c.measurementReceipt(input));
  assert.equal(first.production, true); assert.equal(first.value, 75.25);
  assert.equal(first.payment_confirmed, true); assert.match(first.transaction_id, /^[a-f0-9]{64}$/);
  assert.equal(first.transaction_id, first.booking_id);
  assert.equal((await c.measurementReceipt(input)).transaction_id, first.transaction_id);
  assert.doesNotMatch(JSON.stringify(first), /operational|gateway-secret/);
  assert.equal((await c.measurementReceipt({ ...input, paymentStatus: 'authorized' })).payment_confirmed, false);
  env.MOCK_EXTERNAL_PROVIDERS = 'true';
  assert.equal((await c.measurementReceipt(input)).production, false);
  delete env.MOCK_EXTERNAL_PROVIDERS;
  assert.equal((await c.measurementReceipt({ ...input, provider: 'paypal' })).production, false);
});

test('campaign context is consented, limited, expires, survives SPA and clears by category', () => {
  const b = browser(); const c = b.context;
  c.location.search = '?utm_source=google&utm_campaign=fishing_2026&gclid=AbCdEf0123456789&email=private@example.com';
  c.document.referrer = 'https://search.example/find?email=private@example.com#token';
  assert.equal(c.metaUrlIsSafe(), false);
  assert.deepEqual(plain(c.measurementAttribution()).campaigns, {});
  assert.equal(b.storage.has('pft-attribution-v1'), false);
  c.applyConsent({ analytics: true, marketing: true });
  c.trackPage('/reservar');
  const event = b.events()[0];
  assert.equal(event.campaign_source, 'google');
  assert.equal(event.page_referrer, 'https://search.example');
  assert.doesNotMatch(JSON.stringify(event), /private@example|AbCdEf|email=/);
  assert.equal(c.advertisingAttribution().gclid, 'AbCdEf0123456789');
  c.location.search = '?utm_source=google&fbclid=AbCdEf0123456789';
  assert.equal(c.metaUrlIsSafe(), true);
  c.location.hash = '#access_token=secret';
  assert.equal(c.metaUrlIsSafe(), false);
  c.location.hash = ''; c.location.search = '';
  assert.equal(c.measurementAttribution().campaigns.utm_campaign, 'fishing_2026');
  b.advance(30 * 60 * 1000 + 1);
  assert.deepEqual(plain(c.advertisingAttribution()), {});
  assert.deepEqual(plain(c.measurementAttribution()).campaigns, {});
  c.location.search = '?utm_source=google&gclid=AbCdEf0123456789';
  c.applyConsent({ analytics: true, marketing: false });
  assert.deepEqual(plain(c.advertisingAttribution()), {});
  assert.equal(c.measurementAttribution().campaigns.utm_source, 'google');
  c.applyConsent({ analytics: false, marketing: false });
  assert.equal(b.storage.has('pft-attribution-v1'), false);
});

test('booking attribution persists only identifiers covered by the recorded consent', async () => {
  const b = browser(); const c = b.context;
  c.location.search = '?gclid=AbCdEf0123456789&gbraid=GbRaid0123456789&wbraid=WbRaid0123456789&fbclid=FbClick0123456789&utm_source=google&utm_medium=cpc&utm_campaign=papagayo_2026&utm_content=boat_card&utm_term=fishing_tour';
  c.document.cookie = '_fbp=fb.1.1794609108.123456789; _fbc=fb.1.1794609108.FbClick0123456789';
  const denied = plain(await c.bookingAttribution());
  assert.equal(denied.analyticsConsent, false);
  assert.equal(denied.marketingConsent, false);
  assert.equal(denied.gclid, undefined);
  assert.equal(denied.fbp, undefined);
  assert.equal(denied.gaClientId, undefined);

  c.applyConsent({ analytics: true, marketing: true });
  const granted = plain(await c.bookingAttribution());
  assert.equal(granted.gclid, 'AbCdEf0123456789');
  assert.equal(granted.gbraid, 'GbRaid0123456789');
  assert.equal(granted.wbraid, 'WbRaid0123456789');
  assert.equal(granted.fbclid, 'FbClick0123456789');
  assert.equal(granted.fbp, 'fb.1.1794609108.123456789');
  assert.equal(granted.fbc, 'fb.1.1794609108.FbClick0123456789');
  assert.equal(granted.utmSource, 'google');
  assert.equal(granted.utmMedium, 'cpc');
  assert.equal(granted.utmCampaign, 'papagayo_2026');
  assert.equal(granted.utmContent, 'boat_card');
  assert.equal(granted.utmTerm, 'fishing_tour');
  assert.equal(granted.gaClientId, '123456789.987654321');
  assert.equal(granted.gaSessionId, '1794609108');

  c.applyConsent({ analytics: true, marketing: false });
  const revoked = plain(await c.bookingAttribution());
  assert.equal(revoked.gclid, undefined);
  assert.equal(revoked.fbclid, undefined);
  assert.equal(revoked.fbp, undefined);
  assert.equal(revoked.utmSource, 'google');
  assert.equal(revoked.gaClientId, '123456789.987654321');
});

test('checkout selection emits view_item from the real quoted commerce item', () => {
  const source = fs.readFileSync('src/components/booking/BookingPanel.tsx', 'utf8');
  assert.match(source, /trackViewItem\(commerceContext\.items\[0\], `checkout:\$\{selectedBoat\.id\}:\$\{selectedTour\.id\}`\)/);
});

test('unknown paths, sensitive campaigns, repeated keys and programmatic WhatsApp do not become clicks', () => {
  const b = browser(); const c = b.context;
  c.applyConsent({ analytics: true, marketing: true });
  c.location.search = '?utm_source=email_private&token=abc';
  assert.equal(c.metaUrlIsSafe(), false);
  assert.deepEqual(plain(c.measurementAttribution()).campaigns, {});
  c.location.search = '?utm_source=one&utm_source=two';
  assert.equal(c.metaUrlIsSafe(), false);
  c.trackWhatsApp('https://wa.me/50686105784?text=private', 'open_attempt');
  assert.equal(b.events().filter(e => e.event === 'whatsapp_click').length, 0);
  assert.equal(b.events().filter(e => e.event === 'whatsapp_open_attempt').length, 1);
  assert.equal(vm.runInContext("safePath('/tours/')", c), '/tours');
  c.location.pathname = '/admin'; c.trackViewItem({ item_id: 'hidden', item_name: 'Hidden' }, 'hidden');
  assert.equal(b.events().filter(e => e.event === 'view_item').length, 0);
});

test('GTM template uses synchronous consent APIs before acknowledging; no arbitrary network', () => {
  const order = [];
  const apis = {
    setDefaultConsentState: value => { order.push('default'); assert.equal(value.ad_user_data, 'denied'); },
    updateConsentState: value => { order.push('update'); assert.equal(value.analytics_storage, 'granted'); assert.equal(value.ad_storage, 'denied'); },
    gtagSet() {},
    callInWindow: (name, revision) => {
      if (name === 'pftReadConsent') return { analytics: true, marketing: false, revision: 4 };
      assert.equal(name, 'pftConsentApplied'); assert.equal(revision, 4); order.push('ack');
    },
  };
  vm.runInNewContext(fs.readFileSync('docs/gtm-consent-template.js', 'utf8'), {
    require: name => { assert.ok(name in apis); return apis[name]; }, data: { gtmOnSuccess() { order.push('success'); } },
  });
  assert.deepEqual(order, ['default', 'update', 'ack', 'success']);
});
