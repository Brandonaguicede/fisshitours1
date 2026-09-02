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
}): BookingPaymentPayload {
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
    `Booking reference: ${booking.bookingReference}`,
    `Boat: ${booking.boat.name}`,
    `Tour: ${getTourText(booking.tour, 'en').title}`,
    `Package: ${booking.packageLabel}`,
    `Date: ${formatMessageDate(booking.date)}`,
    `Time: ${booking.time}`,
    `Guests: ${booking.guests}`,
    '',
    'PRICE SUMMARY',
    `Boat base price: ${formatMessageCurrency(booking.basePrice)}`,
    `Includes up to: ${booking.includedGuests} guests`,
    `Additional guests: ${booking.additionalGuests} x ${formatMessageCurrency(booking.additionalGuestPrice)}`,
    `Additional guest charge: ${formatMessageCurrency(booking.additionalGuestCharge)}`,
    `Departure location: ${booking.departureLocationName || 'Not selected'}`,
    `Departure surcharge: ${booking.departureSurcharge > 0 ? formatMessageCurrency(booking.departureSurcharge) : 'No cost'}`,
    `Extras: ${booking.extras.length ? booking.extras.map((extra) => `${extra.label} x${extra.quantity}`).join(', ') : 'None'}`,
    `Extras charge: ${formatMessageCurrency(booking.extrasTotal)}`,
    `Total: ${formatMessageCurrency(booking.total)}`,
    '',
    'PAYMENT METHOD',
    booking.paymentMethod ?? (variant === 'pay_on_day' ? 'Pay on the day of the tour.' : variant === 'payment_link' ? 'WhatsApp payment link.' : 'PayPal.'),
  ];

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
