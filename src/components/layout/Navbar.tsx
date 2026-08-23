import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { navigationItems } from '../../constants/navigation';
import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../utils/cn';
import { Button } from '../common/Button';
import { Container } from '../common/Container';

export function Navbar() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState('/');
  const { language, toggleLanguage } = useLanguage();

  const navLabels: Record<string, { es: string; en: string }> = {
    '/': { es: 'Inicio', en: 'Home' },
    '/#fleet': { es: 'Barcos', en: 'Boats' },
    '/#tours': { es: 'Tours', en: 'Tours' },
    '/#gallery': { es: 'Galeria', en: 'Gallery' },
    '/nosotros': { es: 'Nosotros', en: 'About' },
    '/contacto': { es: 'Contacto', en: 'Contact' },
  };

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 24);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);

    if (location.pathname !== '/') {
      setActiveHref(location.pathname);
      return;
    }

    const hashHref = location.hash ? `/${location.hash}` : '/';
    setActiveHref(navigationItems.some((item) => item.href === hashHref) ? hashHref : '/');

    const sectionItems = navigationItems.filter((item) => item.href.startsWith('/#'));

    function updateActiveSection() {
      if (window.scrollY < window.innerHeight * 0.45) {
        setActiveHref('/');
        return;
      }

      const viewportMarker = window.innerHeight * 0.5;
      let currentHref = '/';

      for (const item of sectionItems) {
        const section = document.getElementById(item.href.slice(2));
        if (section && section.getBoundingClientRect().top <= viewportMarker) currentHref = item.href;
      }

      setActiveHref(currentHref);
    }

    const syncTimer = window.setTimeout(updateActiveSection, location.hash ? 160 : 0);
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);

    return () => {
      window.clearTimeout(syncTimer);
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, [location.hash, location.pathname]);

  return (
    <header className="pointer-events-none fixed left-0 right-0 top-2 z-50 sm:top-3">
      <Container className="relative flex h-14 items-center justify-between gap-3 sm:h-20 sm:gap-4">
        <NavLink
          className="focus-ring pointer-events-auto flex shrink-0 items-center rounded-full text-white transition-all duration-200"
          to="/"
          onClick={() => setIsOpen(false)}
        >
          <span className={cn('grid size-16 shrink-0 place-items-center transition-all duration-300 sm:size-20', isScrolled ? 'drop-shadow-lg' : 'drop-shadow-sm')}>
            <img className="h-full w-full object-contain" src="/images/papagayo-logo.png" alt="" aria-hidden="true" loading="eager" decoding="async" />
          </span>
        </NavLink>

        <nav
          className={cn(
            'glass-surface pointer-events-auto hidden items-center gap-0.5 rounded-full p-1.5 transition-all duration-300 md:absolute md:left-1/2 md:flex md:-translate-x-1/2 lg:gap-1',
            isScrolled && 'brightness-110',
          )}
          aria-label="Navegacion principal"
        >
          {navigationItems.map((item) => {
            const isActive = activeHref === item.href;

            return (
              <Link
                key={item.href}
                className={cn(
                  'focus-ring glass-interactive rounded-full px-2.5 py-2 text-xs font-semibold text-white/75 hover:text-white lg:px-4 lg:text-sm',
                  isActive && 'glass-active text-ocean-950 hover:text-ocean-950',
                )}
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
              >
                {navLabels[item.href]?.[language] ?? item.label}
              </Link>
            );
          })}
        </nav>

        <div className="pointer-events-auto hidden shrink-0 items-center gap-2 md:flex lg:gap-3">
          <button
            className="focus-ring glass-control glass-interactive rounded-full px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-white"
            type="button"
            aria-label={language === 'es' ? 'Cambiar a ingles' : 'Switch to Spanish'}
            onClick={toggleLanguage}
          >
            {language === 'es' ? 'EN' : 'ES'}
          </button>
          <Button variant="secondary" className="glass-primary px-4 text-ocean-900 hover:text-ocean-950 lg:px-5" to="/#booking">
            {language === 'es' ? 'Reservar' : 'Book Now'}
          </Button>
        </div>

        <button
          className={cn(
            'focus-ring glass-control glass-interactive pointer-events-auto relative z-10 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-white md:hidden',
            (isOpen || isScrolled) && 'ring-1 ring-ocean-200/20',
          )}
          type="button"
          aria-label={isOpen ? 'Cerrar menu' : 'Abrir menu'}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? <X size={23} strokeWidth={2.4} /> : <Menu size={24} strokeWidth={2.4} />}
        </button>
      </Container>

      {isOpen ? (
        <div className="glass-surface pointer-events-auto mx-4 mt-2 overflow-hidden rounded-[1.75rem] md:hidden">
          <Container className="grid max-h-[calc(100dvh-5rem)] gap-2 overflow-y-auto py-3">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                className={cn(
                  'focus-ring glass-interactive rounded-2xl px-4 py-3 text-sm font-semibold text-white/80 hover:text-white',
                  activeHref === item.href && 'glass-active text-ocean-950 hover:text-ocean-950',
                )}
                to={item.href}
                aria-current={activeHref === item.href ? 'page' : undefined}
                onClick={() => setIsOpen(false)}
              >
                {navLabels[item.href]?.[language] ?? item.label}
              </Link>
            ))}
            <button
              className="focus-ring glass-control glass-interactive rounded-2xl px-4 py-3 text-left text-sm font-semibold text-white"
              type="button"
              aria-label={language === 'es' ? 'Cambiar a ingles' : 'Switch to Spanish'}
              onClick={toggleLanguage}
            >
              {language === 'es' ? 'English' : 'Español'}
            </button>
            <Button variant="secondary" className="glass-primary mt-2 text-ocean-900 hover:text-ocean-950" to="/#booking">
              {language === 'es' ? 'Reservar' : 'Book Now'}
            </Button>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
