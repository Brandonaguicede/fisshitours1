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
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pft-consent-change', page);
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
