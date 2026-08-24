import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { scrollToHomeSection } from '../../utils/homeNavigation';
import { Footer } from './Footer';
import { Navbar } from './Navbar';

export function MainLayout() {
  const location = useLocation();

  useEffect(() => {
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
    </div>
  );
}
