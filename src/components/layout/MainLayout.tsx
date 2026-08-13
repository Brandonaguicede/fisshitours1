import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { Footer } from './Footer';
import { Navbar } from './Navbar';

export function MainLayout() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const id = window.decodeURIComponent(location.hash.slice(1));
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
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
