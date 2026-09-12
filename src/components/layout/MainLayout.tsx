import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { scrollToHomeSection } from '../../utils/homeNavigation';
import { Footer } from './Footer';
import { Navbar } from './Navbar';
import { CookieNotice } from '../common/CookieNotice';

/**
 * True only for an actual browser reload (F5 / Ctrl+R), via the Navigation
 * Timing API — never for a fresh navigation, a shared/typed link, or an
 * in-app route change. A reload keeps whatever hash was last in the address
 * bar (e.g. `/#tours` after clicking the Tours link earlier), which is not
 * the same thing as the user explicitly asking to go there right now.
 */
function isBrowserReload() {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) return false;
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return entry?.type === 'reload';
}

export function MainLayout() {
  const location = useLocation();
  // Captured once on the very first render and never reassigned — including
  // across React 18 StrictMode's dev-only double-invoke of this effect,
  // which reuses this same ref rather than creating a new one. Comparing
  // the *current* hash against this frozen snapshot (instead of a "have I
  // run yet" flag) makes the reload override naturally idempotent: replayed
  // or repeated runs against an unchanged hash reach the same conclusion,
  // while a later hash change from a real click no longer matches and falls
  // through to normal hash navigation.
  const initialHashRef = useRef(location.hash);

  useEffect(() => {
    if (isBrowserReload() && location.hash === initialHashRef.current) {
      // 'instant': `html` has global `scroll-behavior: smooth`, which 'auto'
      // would inherit and visibly animate on every load for no reason.
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }

    if (!location.hash) {
      if (location.pathname === '/') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    const id = window.decodeURIComponent(location.hash.slice(1));
    const timer = window.setTimeout(() => scrollToHomeSection(id), 80);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.hash]);

  return (
    <div className="min-h-screen bg-ocean-950 text-ocean-50">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <Navbar />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
      <CookieNotice />
    </div>
  );
}
