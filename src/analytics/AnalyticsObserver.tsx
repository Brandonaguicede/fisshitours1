import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPage, trackWhatsApp } from './events';
import { loadConsentedGtm } from './consent';

export function AnalyticsObserver() {
  const { pathname } = useLocation();
  useEffect(() => {
    let timer = 0;
    const page = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { loadConsentedGtm(); trackPage(pathname); }, 0);
    };
    page();
    window.addEventListener('pft-consent-change', page);
    // GTM can acknowledge the stored/new consent before React's deferred route
    // callback creates the initial page event. Retrying here is safe because
    // trackPage deduplicates the current canonical route.
    window.addEventListener('pft-consent-applied', page);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pft-consent-change', page);
      window.removeEventListener('pft-consent-applied', page);
    };
  }, [pathname]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!event.isTrusted || event.button !== 0) return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (anchor?.href) trackWhatsApp(anchor.href);
    };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, []);
  return null;
}
