// Basic Consent Mode: no external request until the application grants a category.
(function () {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    ad_storage: 'denied', analytics_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied'
  });
  window.gtag('set', 'ads_data_redaction', true);
  window.gtag('set', 'url_passthrough', false);
  var flight, loaded = false, attempts = 0, nextAttempt = 0, started = false;
  window.pftLoadGtm = function () {
    if (loaded) return Promise.resolve(true);
    if (flight) return flight;
    if (attempts >= 3 || Date.now() < nextAttempt) return Promise.resolve(false);
    var consent = window.pftReadConsent && window.pftReadConsent();
    if (!consent || (!consent.analytics && !consent.marketing)) return Promise.resolve(false);
    attempts++;
    flight = new Promise(function (resolve) {
      if (!started) {
        window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
        started = true;
      }
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-T5RBJH88';
      script.onload = function () { loaded = true; resolve(true); };
      script.onerror = function () {
        script.remove();
        nextAttempt = Date.now() + 1000 * attempts;
        resolve(false);
      };
      document.head.appendChild(script);
    }).then(function (result) { flight = undefined; return result; });
    // Never retry a mere timeout: the original script could still execute later.
    return flight;
  };
})();
