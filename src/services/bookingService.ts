import { functionsUrl, supabase } from '../lib/supabase';
import type { BookingPaymentMethod } from '../utils/bookingPayment';
import { getStoredLanguage } from '../i18n/LanguageContext';
import { sortDepartureLocations } from '../utils/departureLocations';

export interface PriceRequest {
  boatId: string;
  tourId: string;
  boatTourId?: string;
  tourPackageId: string;
  guests: number;
  departureLocationId?: string;
  extras: Array<{ key: string; quantity: number }>;
}

export interface PriceResult {
  custom_quote: boolean;
  base_price: number | null;
  included_guests?: number;
  max_guests?: number;
  extra_guest_price?: number;
  extra_guests?: number;
  extra_guests_total?: number;
  extras?: Array<{ key: string; label: string; quantity: number; unit_price: number; total: number }>;
  extras_total?: number;
  departure_location?: DepartureLocation;
  departure_surcharge?: number;
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total: number | null;
  currency: string;
}

export interface DepartureLocation {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  description_es: string | null;
  description_en: string | null;
  surcharge_amount: number;
  currency: string;
  active: boolean;
  sort_order: number;
  /** Legacy column, kept in the schema but no longer a product decision: position 1 (sort_order) is the default. */
  is_default?: boolean;
}

export interface CreateBookingRequest {
  customer: { fullName: string; email: string; whatsapp: string; country?: string };
  boatId: string;
  tourId: string;
  tourPackageId: string;
  tourDate: string;
  timeSlotId: string;
  guests: number;
  departureLocationId: string;
  mealOption?: string;
  specialRequests?: string;
  paymentMethodKey: BookingPaymentMethod;
  extras: Array<{ key: string; quantity: number }>;
  turnstileToken?: string;
  language?: 'es' | 'en';
  /** Terms and Conditions acceptance. The backend rejects the booking without it (TERMS_NOT_ACCEPTED); the timestamp and the "web" source are set server-side. */
  termsAccepted: boolean;
  termsVersion: string;
}

export interface AdminCreateBookingRequest extends Omit<CreateBookingRequest, 'turnstileToken' | 'customer' | 'termsVersion'> {
  customer: Omit<CreateBookingRequest['customer'], 'email'> & { email?: string };
  adminNote?: string;
  /** The operator confirms the customer accepted the terms. The version and the "admin" source are fixed by the server. */
  termsAccepted: boolean;
  language: 'es' | 'en';
}

export interface AdminConfirmBookingResult {
  booking_id: string;
  booking_status: string;
  payment_status: string;
  customerEmailPresent: boolean;
  emailQueued: boolean;
}

export interface BookingResult {
  booking_id: string;
  booking_reference: string;
  boat_id: string;
  tour_id: string;
  tour_package_id: string;
  tour_date: string;
  time_slot_id: string;
  guests: number;
  booking_status: string;
  payment_status: string;
  subtotal_snapshot: number;
  tax_rate_snapshot: number;
  tax_amount_snapshot: number;
  total_snapshot: number;
  currency: string;
  base_price_snapshot: number;
  extra_guests_snapshot: number;
  extra_guests_total_snapshot: number;
  extras_total_snapshot: number;
  departure_location_id: string | null;
  departure_location_name_snapshot: string | null;
  departure_surcharge_snapshot: number | null;
  departure_currency_snapshot: string | null;
}

async function callFunction<T>(name: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${functionsUrl}/${name}`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message ?? (getStoredLanguage() === 'es' ? 'La solicitud falló.' : 'Request failed')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export function calculateBookingPrice(input: PriceRequest, signal?: AbortSignal) {
  return callFunction<PriceResult>('calculate-booking-price', input, signal);
}

export function createBooking(input: CreateBookingRequest) {
  return callFunction<BookingResult>('create-booking', input);
}

export function adminCreateBooking(input: AdminCreateBookingRequest) {
  return callFunction<BookingResult>('admin-create-booking', input);
}

export function confirmBooking(bookingId: string) {
  return callFunction<AdminConfirmBookingResult>('admin-confirm-booking', { bookingId });
}

export interface AdminCancelBookingResult {
  booking_id: string;
  booking_status: 'cancelled';
  payment_status: string;
  /** false when the booking was already cancelled (the call was only a Calendar retry). */
  transitioned: boolean;
  calendar: CalendarSyncResult;
}

/** Cancels the booking AND deletes its Google Calendar event in one server-side request; calling it again on a cancelled booking retries the event delete. */
export function cancelBooking(bookingId: string) {
  return callFunction<AdminCancelBookingResult>('admin-cancel-booking', { bookingId });
}

/** Result of syncing a booking with Google Calendar. `failed` never means the booking failed: it stays as it was. */
export interface CalendarSyncResult {
  status: 'synced' | 'failed' | 'skipped';
  operation?: 'create' | 'update' | 'delete';
  eventId?: string;
  error?: string;
}

/** Only the booking id travels: the Edge Function reads everything else from the database. Idempotent (create once, then update). */
export function syncReservationCalendar(reservationId: string) {
  return callFunction<CalendarSyncResult>('sync-reservation-calendar', { reservationId });
}

export function retryConfirmationEmail(bookingId: string) {
  return callFunction<{ customerEmailPresent: boolean; queued: number }>('admin-retry-confirmation-email', { bookingId });
}

export function updateBooking(input: {
  bookingId: string;
  customer: { fullName: string; email?: string; whatsapp: string; country?: string };
  boatId: string;
  tourId: string;
  tourPackageId: string;
  tourDate: string;
  timeSlotId: string;
  guests: number;
  specialRequests?: string;
  /** Required by the database when date, time, package or guests change. */
  reason?: string;
}) {
  return callFunction<{ booking_id: string; booking_status: string; payment_status: string; changed?: boolean }>('admin-update-booking', input);
}

export async function getActiveDepartureLocations() {
  const { data, error } = await (supabase as any)
    .from('departure_locations')
    .select('id, name, slug, description, description_es, description_en, surcharge_amount, currency, active, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  // Position order is the contract for every consumer (first item = default), so it is enforced here, not just in the query.
  return sortDepartureLocations((data ?? []) as DepartureLocation[]);
}
