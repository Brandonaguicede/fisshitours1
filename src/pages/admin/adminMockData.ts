import { boats } from '../../data/boats';
import { boatTours } from '../../data/boatTours';
import { destinations } from '../../data/destinations';
import { galleryImages } from '../../data/gallery';
import { testimonials } from '../../data/testimonials';

export const adminData = {
  boats,
  boatTours,
  destinations,
  galleryImages,
  testimonials,
  reservations: [
    {
      id: 'res-001',
      reference: 'PFT-ME8Q91',
      customer: 'Andrea Vargas',
      email: 'andrea@example.com',
      whatsapp: '+506 8888 1212',
      date: '2026-08-22',
      boat: 'Second Wind',
      tour: 'Fishing Tour - Half Day',
      guests: 5,
      total: 700,
      paymentMethod: 'PayPal',
      paymentStatus: 'paid',
      reservationStatus: 'confirmed',
    },
    {
      id: 'res-002',
      reference: 'PFT-ME8R02',
      customer: 'Marco Sullivan',
      email: 'marco@example.com',
      whatsapp: '+1 415 555 0120',
      date: '2026-08-24',
      boat: 'Second Wind',
      tour: 'Beach & Snorkeling Tour - Full Day',
      guests: 8,
      total: 1145,
      paymentMethod: 'WhatsApp link',
      paymentStatus: 'pending',
      reservationStatus: 'pending_confirmation',
    },
    {
      id: 'res-003',
      reference: 'PFT-ME8S13',
      customer: 'Laura Mendez',
      email: 'laura@example.com',
      whatsapp: '+52 55 5555 1212',
      date: '2026-08-25',
      boat: 'Second Wind',
      tour: 'Bioluminescence Tour - Deluxe Experience',
      guests: 4,
      total: 750,
      paymentMethod: 'Pay on day',
      paymentStatus: 'not_required_yet',
      reservationStatus: 'pending_confirmation',
    },
  ],
  paymentMethods: [
    { id: 'paypal', name: 'PayPal', type: 'paypal', active: true, description: 'Secure USD checkout.' },
    { id: 'whatsapp-link', name: 'WhatsApp payment link', type: 'whatsapp_link', active: true, description: 'Admin sends a payment link manually.' },
    { id: 'pay-on-day', name: 'Pay on day', type: 'pay_on_day', active: true, description: 'Customer pays when the tour starts.' },
  ],
  content: [
    { key: 'home.hero.title', locale: 'en', group: 'Home', type: 'text', value: 'Private Fishing Tours Costa Rica', active: true },
    { key: 'home.hero.subtitle', locale: 'en', group: 'Home', type: 'textarea', value: 'Private ocean adventures aboard Second Wind.', active: true },
    { key: 'contact.whatsapp', locale: 'en', group: 'Contact', type: 'text', value: '+506 8610 5784', active: true },
    { key: 'booking.terms.confirmation', locale: 'en', group: 'Booking', type: 'textarea', value: 'Booking requests remain pending until availability is confirmed.', active: true },
  ],
};

export function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
