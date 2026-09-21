import { formatTime } from './format';
import { WHATSAPP_NUMBER } from '../constants/contact';
import { getPackageLabel, getTourText } from '../i18n/content';
import type { Boat } from '../types/boat';
import type { BoatTour, TourTimeSlot } from '../types/boatTour';
import type { calculateBookingTotal } from './bookingPricing';

export type BookingPaymentMethod = 'paypal' | 'whatsapp-link' | 'pay-on-day';
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'not_required_yet';

export type BookingStatus =
  | 'pending'
  | 'pending_payment'
  | 'pending_confirmation'
  | 'confirmed'
  | 'cancelled'
  | 'completed';

export interface BookingPaymentPayload {
  bookingReference: string;
  customerName: string;
  phone: string;
  email: string;
  boat: Boat;
  tour: BoatTour;
  packageLabel: string;
  date: string;
  time: string;
  guests: number;
  basePrice: number;
  includedGuests: number;
  additionalGuests: number;
  additionalGuestPrice: number;
  additionalGuestCharge: number;
  departureLocationName: string;
  departureSurcharge: number;
  departureCurrency: string;
  extras: Array<{ key: string; label: string; quantity: number; unit_price: number; total: number }>;
  extrasTotal: number;
  total: number;
  specialRequests: string;
  paymentMethod?: string;
  paymentStatus?: PaymentStatus;
}

type BookingPricing = ReturnType<typeof calculateBookingTotal>;

export function buildBookingPaymentPayload(input: {
  bookingReference: string;
  customerName: string;
  phone: string;
  email: string;
  boat: Boat;
  tour: BoatTour;
  timeSlot?: TourTimeSlot;
  date: string;
  guests: number;
  pricing: BookingPricing;
  departureLocation?: { name: string; surcharge_amount: number; currency: string };
  extras?: Array<{ key: string; label: string; quantity: number; unit_price: number; total: number }>;
  specialRequests: string;
  language: 'es' | 'en';
}): BookingPaymentPayload {
  return {
    bookingReference: input.bookingReference,
    customerName: cleanText(input.customerName),
    phone: cleanText(input.phone),
    email: cleanText(input.email),
    boat: input.boat,
    tour: input.tour,
    packageLabel: getPackageLabel(input.tour, input.language),
    date: input.date,
    time: cleanText(formatTime(input.timeSlot?.time ?? '')),
    guests: input.guests,
    basePrice: input.pricing.basePrice,
    includedGuests: input.pricing.includedGuests,
    additionalGuests: input.pricing.extraGuests,
    additionalGuestPrice: input.pricing.extraGuestPrice,
    additionalGuestCharge: input.pricing.extraGuestsTotal,
    departureLocationName: cleanText(input.departureLocation?.name ?? ''),
    departureSurcharge: Number(input.departureLocation?.surcharge_amount ?? input.pricing.departureSurcharge ?? 0),
    departureCurrency: input.departureLocation?.currency ?? 'USD',
    extras: input.extras ?? [],
    extrasTotal: input.pricing.extrasTotal,
    total: input.pricing.total,
    specialRequests: cleanText(input.specialRequests) || (input.language === 'es' ? 'Ninguna' : 'None'),
  };
}

// This becomes the customer's own pre-filled WhatsApp message — they review
// and send it themselves — so it follows the site's language the same as
// any other customer-facing text, not a fixed operating language.
export function createWhatsAppBookingMessage(booking: BookingPaymentPayload, variant: 'payment_link' | 'pay_on_day' | 'paid_confirmation' = 'payment_link', language: 'es' | 'en' = 'en') {
  const es = language === 'es';
  const opening =
    variant === 'payment_link'
      ? (es ? 'Hola, quisiera hacer una reserva y solicitar un enlace de pago.' : 'Hello, I would like to make a reservation and request a payment link.')
      : variant === 'pay_on_day'
        ? (es ? 'Hola, quisiera solicitar una reserva.' : 'Hello, I would like to request a reservation.')
        : (es ? 'Hola, quisiera enviar mi confirmación de pago para esta reserva.' : 'Hello, I would like to send my payment confirmation for this reservation.');

  const lines = [
    opening,
    '',
    es ? 'INFORMACIÓN DEL CLIENTE' : 'CUSTOMER INFORMATION',
    `${es ? 'Nombre' : 'Name'}: ${booking.customerName}`,
    `${es ? 'Teléfono' : 'Phone'}: ${booking.phone}`,
    `${es ? 'Correo' : 'Email'}: ${booking.email}`,
    '',
    es ? 'DETALLES DE LA RESERVA' : 'BOOKING DETAILS',
    `${es ? 'Referencia de reserva' : 'Booking reference'}: ${booking.bookingReference}`,
    `${es ? 'Bote' : 'Boat'}: ${booking.boat.name}`,
    `${es ? 'Tour' : 'Tour'}: ${getTourText(booking.tour, language).title}`,
    `${es ? 'Paquete' : 'Package'}: ${booking.packageLabel}`,
    `${es ? 'Fecha' : 'Date'}: ${formatMessageDate(booking.date, language)}`,
    `${es ? 'Hora' : 'Time'}: ${booking.time}`,
    `${es ? 'Personas' : 'Guests'}: ${booking.guests}`,
    '',
    es ? 'RESUMEN DE PRECIO' : 'PRICE SUMMARY',
    `${es ? 'Precio base del bote' : 'Boat base price'}: ${formatMessageCurrency(booking.basePrice)}`,
    `${es ? 'Incluye hasta' : 'Includes up to'}: ${booking.includedGuests} ${es ? 'personas' : 'guests'}`,
    `${es ? 'Personas extra' : 'Additional guests'}: ${booking.additionalGuests} x ${formatMessageCurrency(booking.additionalGuestPrice)}`,
    `${es ? 'Cargo por personas extra' : 'Additional guest charge'}: ${formatMessageCurrency(booking.additionalGuestCharge)}`,
    `${es ? 'Lugar de salida' : 'Departure location'}: ${booking.departureLocationName || (es ? 'No seleccionado' : 'Not selected')}`,
    `${es ? 'Cargo por salida' : 'Departure surcharge'}: ${booking.departureSurcharge > 0 ? formatMessageCurrency(booking.departureSurcharge) : (es ? 'Sin costo' : 'No cost')}`,
    `${es ? 'Extras' : 'Extras'}: ${booking.extras.length ? booking.extras.map((extra) => `${extra.label} x${extra.quantity}`).join(', ') : (es ? 'Ninguno' : 'None')}`,
    `${es ? 'Cargo de extras' : 'Extras charge'}: ${formatMessageCurrency(booking.extrasTotal)}`,
    `${es ? 'Total' : 'Total'}: ${formatMessageCurrency(booking.total)}`,
    '',
    es ? 'MÉTODO DE PAGO' : 'PAYMENT METHOD',
    booking.paymentMethod ?? (variant === 'pay_on_day' ? (es ? 'Pago el día del tour.' : 'Pay on the day of the tour.') : variant === 'payment_link' ? (es ? 'Enlace de pago por WhatsApp.' : 'WhatsApp payment link.') : 'PayPal.'),
  ];

  lines.push('', es ? 'SOLICITUDES ESPECIALES' : 'SPECIAL REQUESTS', booking.specialRequests || (es ? 'Ninguna' : 'None'), '');
  lines.push(variant === 'payment_link'
    ? (es ? 'Por favor confirmen disponibilidad y envíenme el enlace de pago.' : 'Please confirm availability and send me the payment link.')
    : (es ? 'Por favor confirmen la disponibilidad de esta reserva.' : 'Please confirm the availability of this reservation.'));

  return lines.join('\n');
}

export function getWhatsAppBookingUrl(message: string) {
  const whatsappNumber = sanitizeWhatsAppNumber(import.meta.env.VITE_WHATSAPP_NUMBER || WHATSAPP_NUMBER);
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function sanitizeWhatsAppNumber(value: string) {
  return value.replace(/\D/g, '');
}

export function formatMessageCurrency(value: number) {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}

function formatMessageDate(value: string, language: 'es' | 'en') {
  if (!value) return language === 'es' ? 'No seleccionada' : 'Not selected';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(language === 'es' ? 'es-CR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}
