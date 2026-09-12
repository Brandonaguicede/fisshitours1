import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';

import { primaryNavigationItems } from '../../constants/navigation';
import { useLanguage } from '../../i18n/LanguageContext';
import { useDismissOnOutsideClick } from '../../hooks/useDismissOnOutsideClick';
import { tr } from '../../i18n/translations';
import { scrollToHomeSection, getSafeHeaderHeight } from '../../utils/homeNavigation';
import { cn } from '../../utils/cn';
import { Button, IconButton } from '../ui';
import { Container } from '../common/Container';

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState('/');
  const { language, toggleLanguage } = useLanguage();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLSpanElement | null>(null);
  const reduceMotion = useReducedMotion();

  function handleNavigationClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    setIsOpen(false);
    if (href === '/' && location.pathname === '/') {
      event.preventDefault();
      // Clicking Inicio while a previous section's hash (e.g. #fleet) is
      // still in the URL must actually clear it — not just scroll — or the
      // address bar keeps claiming a section that is no longer in view.
      if (location.hash) navigate('/', { replace: true });
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

    // A single IntersectionObserver replaces per-frame scroll math: each
    // section reports how much of it sits in the band directly under the
    // sticky navbar, and whichever has the largest share there is "active".
    // Naturally tracks scroll of any speed/origin (drag, wheel, or a
    // programmatic smooth-scroll from a nav click) without extra listeners.
    let observer: IntersectionObserver | null = null;
    let resizeFrame: number | null = null;
    const ratiosByTarget = new Map<Element, number>();

    function pickActiveSection() {
      let bestTarget: Element | null = null;
      let bestRatio = 0;
      ratiosByTarget.forEach((ratio, target) => {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestTarget = target;
        }
      });
      // Active-tracking is read-only: it may only set which nav item looks
      // highlighted. It must never touch the route, the hash, or scroll —
      // during an in-flight scroll toward a distant section, Hero (very
      // tall) can still register the highest intersection ratio for a
      // moment even though the hash already points at the real target; if
      // this ever called navigate()/scrollToHomeSection() here, that stale
      // "Home" reading would race the real navigation and cancel it via
      // MainLayout's effect cleanup — confirmed in this exact form via
      // console instrumentation before this comment was written.
      const activeSection = bestRatio > 0 ? (bestTarget as HTMLElement | null)?.closest<HTMLElement>('[data-home-section]') : null;
      setActiveHref(activeSection?.dataset.navHref ?? '');
    }

    function buildObserver() {
      observer?.disconnect();
      ratiosByTarget.clear();
      const sections = document.querySelectorAll<HTMLElement>('[data-home-section]');
      // Observe each section's `[data-nav-frame]` (falling back to the
      // section itself) rather than the whole `<section>` — the frame is the
      // exact composition scrollToHomeSection lands on, so "active" and
      // "landed" always agree on what counts as being in that section.
      const targets = Array.from(sections).map((section) => section.querySelector<HTMLElement>('[data-nav-frame]') ?? section);
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => ratiosByTarget.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0));
          pickActiveSection();
        },
        {
          // Only the slice of the viewport just below the fixed navbar (down
          // to just past mid-screen) counts as the "active" band, so a
          // section must actually be the one sitting under the header to win.
          rootMargin: `-${getSafeHeaderHeight()}px 0px -55% 0px`,
          threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        },
      );
      targets.forEach((target) => observer!.observe(target));
    }

    buildObserver();

    function handleResize() {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(buildObserver);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', handleResize);
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    };
  }, [location.pathname]);

  useDismissOnOutsideClick(isOpen, [menuRef, menuButtonRef], () => setIsOpen(false));

  return (
    <header className="pointer-events-none fixed left-0 right-0 top-2 z-50 sm:top-3">
      <Container className="relative flex h-14 items-center justify-between gap-3 sm:h-[4.5rem] sm:gap-4" data-navbar-bar>
        <NavLink
          className="glass-focus-ring pointer-events-auto flex shrink-0 items-center rounded-full text-white transition-all duration-200"
          to="/"
          onClick={(event) => handleNavigationClick(event, '/')}
        >
          <span className={cn('grid size-14 shrink-0 place-items-center transition-all duration-300 sm:size-16', isScrolled ? 'drop-shadow-lg' : 'drop-shadow-sm')}>
            <img className="h-full w-full object-contain" src="/images/papagayo-logo.png" alt="" aria-hidden="true" loading="eager" decoding="async" />
          </span>
        </NavLink>

        <nav
          className={cn(
            'navbar-nav-shell pointer-events-auto hidden shrink-0 items-center gap-0 rounded-full px-1.5 py-1.5 transition-all duration-300 md:absolute md:left-1/2 md:flex md:-translate-x-1/2 lg:gap-0.5 lg:px-2',
            isScrolled && 'brightness-110',
          )}
          aria-label="Navegacion principal"
        >
          {primaryNavigationItems.map((item) => {
            const isActive = activeHref === item.href;

            return (
              <Link
                key={item.href}
                className={cn('navbar-link shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold text-white/72 lg:px-3 lg:text-sm', isActive && 'navbar-link-active')}
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={(event) => handleNavigationClick(event, item.href)}
              >
                {tr(item.label, language)}
              </Link>
            );
          })}
        </nav>

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
          <Button size="sm" to="/#booking">
            {language === 'es' ? 'Reservar' : 'Book Now'}
          </Button>
        </div>

        <span ref={menuButtonRef} className="contents">
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
        </span>
      </Container>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            ref={menuRef}
            className="navbar-nav-shell pointer-events-auto mx-4 mt-2 overflow-hidden rounded-[var(--radius-panel)] md:hidden"
            initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <Container className="grid max-h-[calc(100dvh-5rem)] gap-2 overflow-y-auto py-3">
              {primaryNavigationItems.map((item) => (
                <Link
                  key={item.href}
                  className={cn('navbar-link rounded-2xl px-4 py-3 text-sm font-semibold text-white/80', activeHref === item.href && 'navbar-link-active')}
                  to={item.href}
                  aria-current={activeHref === item.href ? 'page' : undefined}
                  onClick={(event) => handleNavigationClick(event, item.href)}
                >
                  {tr(item.label, language)}
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
