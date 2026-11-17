// Source for a GTM sandboxed tag template, NOT a browser script or Custom HTML.
// Fire at Consent Initialization (all pages) AND Custom Event consent_updated.
// Permissions: write four consent types, read/call only pftReadConsent and
// pftConsentApplied; no network, cookies, storage, DOM or arbitrary globals.
const setDefaultConsentState = require('setDefaultConsentState');
const updateConsentState = require('updateConsentState');
const callInWindow = require('callInWindow');
const gtagSet = require('gtagSet');
setDefaultConsentState({
  analytics_storage: 'denied', ad_storage: 'denied',
  ad_user_data: 'denied', ad_personalization: 'denied'
});
gtagSet('ads_data_redaction', true);
gtagSet('url_passthrough', false);
const choice = callInWindow('pftReadConsent');
if (choice) {
  updateConsentState({
    analytics_storage: choice.analytics === true ? 'granted' : 'denied',
    ad_storage: choice.marketing === true ? 'granted' : 'denied',
    ad_user_data: choice.marketing === true ? 'granted' : 'denied',
    ad_personalization: choice.marketing === true ? 'granted' : 'denied'
  });
  callInWindow('pftConsentApplied', choice.revision);
}
data.gtmOnSuccess();
