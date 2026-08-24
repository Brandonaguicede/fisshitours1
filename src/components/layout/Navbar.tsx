import { Menu, X } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { navigationItems } from '../../constants/navigation';
import { useLanguage } from '../../i18n/LanguageContext';
import { scrollToHomeSection } from '../../utils/homeNavigation';
import { cn } from '../../utils/cn';
import { Button, GlassPanel, IconButton } from '../ui';
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

  function handleNavigationClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    setIsOpen(false);
    if (href === '/' && location.pathname === '/') {
      event.preventDefault();
      scrollToHomeSection('home');
      return;
    }

    const hash = href.startsWith('/#') ? href.slice(1) : '';
    if (hash && location.pathname === '/' && location.hash === hash) {
      event.preventDefault();
      scrollToHomeSection(window.decodeURIComponent(hash.slice(1)));
    }
  }

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

    function updateActiveSection() {
      const rootStyles = getComputedStyle(document.documentElement);
      const configuredGap = Number.parseFloat(rootStyles.getPropertyValue('--nav-section-gap'));
      const navbarBottom = document.querySelector<HTMLElement>('[data-navbar-bar]')?.getBoundingClientRect().bottom ?? 0;
      const viewportMarker = navbarBottom + (Number.isFinite(configuredGap) ? configuredGap : 48) + 1;
      const currentSection = Array.from(document.querySelectorAll<HTMLElement>('[data-home-section]')).find((section) => {
        const bounds = section.getBoundingClientRect();
        return Math.round(bounds.top) <= viewportMarker && Math.round(bounds.bottom) > viewportMarker;
      });

      setActiveHref(currentSection?.dataset.navHref ?? '');
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
      <Container className="relative flex h-14 items-center justify-between gap-3 sm:h-20 sm:gap-4" data-navbar-bar>
        <NavLink
          className="glass-focus-ring pointer-events-auto flex shrink-0 items-center rounded-full text-white transition-all duration-200"
          to="/"
          onClick={(event) => handleNavigationClick(event, '/')}
        >
          <span className={cn('grid size-16 shrink-0 place-items-center transition-all duration-300 sm:size-20', isScrolled ? 'drop-shadow-lg' : 'drop-shadow-sm')}>
            <img className="h-full w-full object-contain" src="/images/papagayo-logo.png" alt="" aria-hidden="true" loading="eager" decoding="async" />
          </span>
        </NavLink>

        <GlassPanel
          as="nav"
          className={cn(
            'pointer-events-auto hidden items-center gap-0.5 p-1.5 transition-all duration-300 md:absolute md:left-1/2 md:flex md:-translate-x-1/2 lg:gap-1',
            isScrolled && 'brightness-110',
          )}
          shape="pill"
          variant="surface"
          aria-label="Navegacion principal"
        >
          {navigationItems.map((item) => {
            const isActive = activeHref === item.href;

            return (
              <Link
                key={item.href}
                className={cn(
                  'glass-focus-ring glass-interactive rounded-full px-2.5 py-2 text-xs font-semibold text-white/75 lg:px-4 lg:text-sm',
                  isActive && 'text-white',
                )}
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={(event) => handleNavigationClick(event, item.href)}
              >
                {navLabels[item.href]?.[language] ?? item.label}
              </Link>
            );
          })}
        </GlassPanel>

        <div className="pointer-events-auto hidden shrink-0 items-center gap-2 md:flex lg:gap-3">
          <Button
            size="sm"
            variant="glass"
            type="button"
            aria-label={language === 'es' ? 'Cambiar a ingles' : 'Switch to Spanish'}
            onClick={toggleLanguage}
          >
            {language === 'es' ? 'EN' : 'ES'}
          </Button>
          <Button to="/#booking">
            {language === 'es' ? 'Reservar' : 'Book Now'}
          </Button>
        </div>

        <IconButton
          className={cn(
            'pointer-events-auto relative z-10 md:hidden',
          )}
          icon={isOpen ? X : Menu}
          label={isOpen ? 'Cerrar menu' : 'Abrir menu'}
          size="lg"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        />
      </Container>

      {isOpen ? (
        <GlassPanel className="pointer-events-auto mx-4 mt-2 overflow-hidden md:hidden" variant="surface">
          <Container className="grid max-h-[calc(100dvh-5rem)] gap-2 overflow-y-auto py-3">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                className={cn(
                  'glass-focus-ring glass-interactive rounded-2xl px-4 py-3 text-sm font-semibold text-white/80',
                  activeHref === item.href && 'text-white',
                )}
                to={item.href}
                aria-current={activeHref === item.href ? 'page' : undefined}
                onClick={(event) => handleNavigationClick(event, item.href)}
              >
                {navLabels[item.href]?.[language] ?? item.label}
              </Link>
            ))}
            <Button
              className="justify-start"
              fullWidth
              variant="glass"
              type="button"
              aria-label={language === 'es' ? 'Cambiar a ingles' : 'Switch to Spanish'}
              onClick={toggleLanguage}
            >
              {language === 'es' ? 'English' : 'Español'}
            </Button>
            <Button className="mt-2" to="/#booking">
              {language === 'es' ? 'Reservar' : 'Book Now'}
            </Button>
          </Container>
        </GlassPanel>
      ) : null}
    </header>
  );
}
