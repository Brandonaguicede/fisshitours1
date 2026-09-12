import { text } from '../i18n/translations';
import type { NavigationItem } from '../types/navigation';

/**
 * Single source of truth for the site's primary navigation — shared by the
 * navbar (desktop + mobile) and the footer. `href` doubles as both the
 * router target and (for the `/#id` entries) the id of the `data-nav-href`
 * home section it should highlight while scrolled into view.
 */
export const navigationItems: NavigationItem[] = [
  { label: text.nav.home, href: '/' },
  { label: text.nav.boats, href: '/#fleet' },
  { label: text.nav.tours, href: '/#tours' },
  { label: text.nav.book, href: '/#booking' },
  { label: text.nav.reviews, href: '/#comments' },
  { label: text.nav.gallery, href: '/#gallery' },
  { label: text.nav.about, href: '/#about' },
  { label: text.nav.contact, href: '/contacto' },
];

/**
 * The navbar drops "Contacto" (it now lives as a CTA inside the Home About
 * section instead) while the footer keeps the full list — both still read
 * from the one array above so there is nothing to keep in sync by hand.
 */
export const primaryNavigationItems: NavigationItem[] = navigationItems.filter((item) => item.href !== '/contacto');
