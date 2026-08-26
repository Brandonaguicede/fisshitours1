import { useQuery } from '@tanstack/react-query';
import { Facebook, Instagram, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

import { DISPLAY_PHONE, FACEBOOK_URL, INSTAGRAM_URL } from '../../constants/contact';
import { navigationItems } from '../../constants/navigation';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { getActiveBoatTours } from '../../services/boatTourService';
import { Container } from '../common/Container';
import { IconButton } from '../ui';

function uniqueTourTitles(tours: Array<{ tourId?: string; tourTitle?: string }>) {
  const seen = new Set<string>();
  const titles: Array<{ id: string; title: string }> = [];
  for (const tour of tours) {
    if (!tour.tourId || !tour.tourTitle || seen.has(tour.tourId)) continue;
    seen.add(tour.tourId);
    titles.push({ id: tour.tourId, title: tour.tourTitle });
    if (titles.length >= 4) break;
  }
  return titles;
}

function navLabel(href: string, language: 'es' | 'en') {
  if (href === '/') return tr(text.nav.home, language);
  if (href === '/#fleet') return tr(text.nav.boats, language);
  if (href === '/#tours') return tr(text.nav.tours, language);
  if (href === '/#gallery') return tr(text.nav.gallery, language);
  if (href === '/nosotros') return tr(text.nav.about, language);
  return tr(text.nav.contact, language);
}

export function Footer() {
  const { language } = useLanguage();
  const toursQuery = useQuery({ queryKey: ['boatTours', 'active'], queryFn: getActiveBoatTours });
  const footerTours = uniqueTourTitles(toursQuery.data ?? []);

  return (
    <footer className="bg-ocean-950 text-white" id="footer">
      <Container className="grid gap-10 py-16 md:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <div>
          <Link className="flex items-center gap-3 text-xl font-extrabold" to="/">
            <span className="grid h-[4.5rem] w-[4.5rem] place-items-center drop-shadow-lg">
              <img className="h-full w-full object-contain" src="/images/papagayo-logo.png" alt="" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              Papagayo <span className="text-white">Fishing Tours</span>
            </span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-ocean-200">
            {language === 'es'
              ? 'Charters de pesca, navegación privada, snorkeling, playa y bioluminiscencia en Costa Rica.'
              : 'Fishing charters, private navigation, snorkeling, beach and bioluminescence in Costa Rica.'}
          </p>
          <div className="mt-5 flex gap-3">
            <IconButton href={INSTAGRAM_URL} icon={Instagram} label="Instagram" size="sm" target="_blank" variant="subtle" />
            <IconButton href={FACEBOOK_URL} icon={Facebook} label="Facebook" size="sm" target="_blank" variant="subtle" />
          </div>
        </div>

        <div>
          <h3 className="font-semibold">{language === 'es' ? 'Navegación' : 'Navigation'}</h3>
          <div className="mt-4 grid gap-2">
            {navigationItems.map((item) => (
              <Link className="text-sm text-ocean-200 transition hover:text-ocean-400" key={item.href} to={item.href}>
                {navLabel(item.href, language)}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold">Tours</h3>
          <div className="mt-4 grid gap-2">
            {footerTours.map((tour) => (
              <Link className="text-sm text-ocean-200 transition hover:text-ocean-400" key={tour.id} to="/tours#tours">
                {tour.title}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold">{tr(text.nav.contact, language)}</h3>
          <div className="mt-4 grid gap-3 text-sm text-ocean-200">
            <span className="flex items-center gap-2">
              <MapPin size={16} /> San José, Costa Rica
            </span>
            <span className="flex items-center gap-2">
              <Phone size={16} /> {DISPLAY_PHONE}
            </span>
            <span className="flex items-center gap-2">
              <Mail size={16} /> info@papagayofishingtours.com
            </span>
          </div>
        </div>
      </Container>
      <div className="border-t border-white/10 py-5 text-center text-sm text-ocean-200">
        © 2026 Papagayo Fishing Tours. {language === 'es' ? 'Todos los derechos reservados.' : 'All rights reserved.'}
      </div>
    </footer>
  );
}
