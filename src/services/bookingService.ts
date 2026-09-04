import { functionsUrl, supabase } from '../lib/supabase';
import type { BookingPaymentMethod } from '../utils/bookingPayment';

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
  total: number | null;
  currency: string;
}

export interface DepartureLocation {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  surcharge_amount: number;
  currency: string;
  active: boolean;
  sort_order: number;
  is_default: boolean;
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
}

export interface AdminCreateBookingRequest extends Omit<CreateBookingRequest, 'turnstileToken'> {
  markAsPaid?: boolean;
  adminNote?: string;
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

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${functionsUrl}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message ?? 'Request failed') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export function calculateBookingPrice(input: PriceRequest) {
  return callFunction<PriceResult>('calculate-booking-price', input);
}

export function createBooking(input: CreateBookingRequest) {
  return callFunction<BookingResult>('create-booking', input);
}

export function adminCreateBooking(input: AdminCreateBookingRequest) {
  return callFunction<BookingResult>('admin-create-booking', input);
}

export async function getActiveDepartureLocations() {
  const { data, error } = await (supabase as any)
    .from('departure_locations')
    .select('id, name, slug, description, surcharge_amount, currency, active, sort_order, is_default')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DepartureLocation[];
}
