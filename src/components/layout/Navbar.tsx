import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { navigationItems } from '../../constants/navigation';
import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../utils/cn';
import { Button } from '../common/Button';
import { Container } from '../common/Container';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
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

  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-50 transition-all duration-300',
        isScrolled ? 'border-b border-white/10 bg-ocean-950/82 shadow-sm backdrop-blur-xl' : 'border-b border-transparent bg-transparent',
      )}
    >
      <Container className="flex h-14 items-center justify-between sm:h-20">
        <NavLink
          className="focus-ring flex min-w-0 items-center gap-3 rounded-full text-white transition-colors duration-300 sm:gap-4"
          to="/"
          onClick={() => setIsOpen(false)}
        >
          <span className={cn('grid h-16 w-16 shrink-0 place-items-center transition-all duration-300 sm:h-28 sm:w-28', isScrolled ? 'drop-shadow-lg' : 'drop-shadow-sm')}>
            <img className="h-full w-full object-contain" src="/images/papagayo-logo.png" alt="" aria-hidden="true" loading="eager" decoding="async" />
          </span>
          <span className="leading-tight">
             <span className="text-white"></span>
          </span>
        </NavLink>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navegacion principal">
          {navigationItems.map((item) => (
            <NavLink
              key={item.href}
              className={({ isActive }) =>
                cn(
                  'focus-ring rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300',
                  'text-white/82 hover:bg-white/10 hover:text-white',
                  isActive && 'bg-white/10 text-white',
                )
              }
              to={item.href}
            >
              {navLabels[item.href]?.[language] ?? item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <button
            className="focus-ring pressable rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-white hover:bg-white/15"
            type="button"
            aria-label={language === 'es' ? 'Cambiar a ingles' : 'Switch to Spanish'}
            onClick={toggleLanguage}
          >
            {language === 'es' ? 'EN' : 'ES'}
          </button>
          <Button className={isScrolled ? '' : 'border-white/70 bg-white text-ocean-900 hover:bg-ocean-100'} to="/#booking">
            {language === 'es' ? 'Reservar' : 'Book Now'}
          </Button>
        </div>

        <button
          className={cn(
            'focus-ring pressable relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all duration-300 md:hidden',
            isOpen || isScrolled ? 'border-white/15 bg-ocean-950/75 text-white shadow-sm backdrop-blur-xl' : 'border-white/35 bg-white/10 text-white backdrop-blur-xl',
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
        <div className="border-t border-white/10 bg-ocean-950/96 shadow-soft backdrop-blur-2xl md:hidden">
          <Container className="grid max-h-[calc(100dvh-3.5rem)] gap-2 overflow-y-auto py-3">
            {navigationItems.map((item) => (
              <NavLink
                key={item.href}
                className="focus-ring rounded-2xl px-4 py-3 text-sm font-semibold text-white hover:bg-white hover:text-ocean-900"
                to={item.href}
                onClick={() => setIsOpen(false)}
              >
                {navLabels[item.href]?.[language] ?? item.label}
              </NavLink>
            ))}
            <button
              className="focus-ring pressable rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white hover:text-ocean-900"
              type="button"
              aria-label={language === 'es' ? 'Cambiar a ingles' : 'Switch to Spanish'}
              onClick={toggleLanguage}
            >
              {language === 'es' ? 'English' : 'Español'}
            </button>
            <Button className="mt-2 border-white/70 bg-white text-ocean-900 hover:bg-ocean-100" to="/#booking">
              {language === 'es' ? 'Reservar' : 'Book Now'}
            </Button>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
