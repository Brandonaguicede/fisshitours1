import { WHATSAPP_NUMBER } from '../constants/contact';
import { getPackageLabel, getTourText } from '../i18n/content';
import type { Boat } from '../types/boat';
import type { BoatTour, TourTimeSlot } from '../types/boatTour';
import type { calculateBookingTotal } from './bookingPricing';

export type BookingPaymentMethod = 'paypal' | 'whatsapp-link' | 'pay-on-day';
export type BookingStatus =
  | 'draft'
  | 'pending_payment'
  | 'payment_link_requested'
  | 'pay_on_tour_day'
  | 'paid'
  | 'confirmed'
  | 'cancelled'
  | 'payment_failed';

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
  additionalGuests: number;
  additionalGuestPrice: number;
  additionalGuestCharge: number;
  total: number;
  specialRequests: string;
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
  specialRequests: string;
}): BookingPaymentPayload {
  const tourText = getTourText(input.tour, 'en');

  return {
    bookingReference: input.bookingReference,
    customerName: cleanText(input.customerName),
    phone: cleanText(input.phone),
    email: cleanText(input.email),
    boat: input.boat,
    tour: input.tour,
    packageLabel: getPackageLabel(input.tour, 'en'),
    date: input.date,
    time: cleanText(input.timeSlot?.time ?? ''),
    guests: input.guests,
    basePrice: input.pricing.basePrice,
    additionalGuests: input.pricing.extraGuests,
    additionalGuestPrice: input.pricing.extraGuestPrice,
    additionalGuestCharge: input.pricing.extraGuestsTotal,
    total: input.pricing.total,
    specialRequests: cleanText(input.specialRequests) || 'None',
  };
}

export function createWhatsAppBookingMessage(booking: BookingPaymentPayload, variant: 'payment_link' | 'pay_on_day' | 'paid_confirmation' = 'payment_link') {
  const opening =
    variant === 'payment_link'
      ? 'Hello, I would like to make a reservation and request a payment link.'
      : variant === 'pay_on_day'
        ? 'Hello, I would like to request a reservation.'
        : 'Hello, I would like to send my payment confirmation for this reservation.';

  const lines = [
    opening,
    '',
    'CUSTOMER INFORMATION',
    `Name: ${booking.customerName}`,
    `Phone: ${booking.phone}`,
    `Email: ${booking.email}`,
    '',
    'BOOKING DETAILS',
    `Boat: ${booking.boat.name}`,
    `Tour: ${getTourText(booking.tour, 'en').title}`,
    `Package: ${booking.packageLabel}`,
    `Date: ${formatMessageDate(booking.date)}`,
    `Time: ${booking.time}`,
    `Guests: ${booking.guests}`,
    '',
    'PRICE SUMMARY',
    `Base price: ${formatMessageCurrency(booking.basePrice)}`,
    `Additional guests: ${booking.additionalGuests} x ${formatMessageCurrency(booking.additionalGuestPrice)}`,
    `Additional guest charge: ${formatMessageCurrency(booking.additionalGuestCharge)}`,
    `Total: ${formatMessageCurrency(booking.total)}`,
  ];

  if (variant === 'pay_on_day') {
    lines.push('', 'PAYMENT METHOD', 'Pay on the day of the tour.');
  }

  lines.push('', 'SPECIAL REQUESTS', booking.specialRequests || 'None', '');
  lines.push(variant === 'payment_link' ? 'Please confirm availability and send me the payment link.' : 'Please confirm the availability of this reservation.');

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

function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}
