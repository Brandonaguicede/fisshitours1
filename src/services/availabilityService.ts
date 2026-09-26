import { functionsUrl, supabase } from '../lib/supabase';
import { getStoredLanguage } from '../i18n/LanguageContext';

export interface AvailabilitySlot {
  id: string;
  label: string;
  time: string;
  available: boolean;
}

export type AvailabilityErrorKind = 'package_unavailable' | 'network' | 'unavailable';

/**
 * Why availability could not be loaded, so the booking form can tell the customer the truth without leaking internals:
 *  - package_unavailable: the option itself cannot be booked (a package that is inactive or missing what a booking needs, a boat / tour link that is off);
 *  - network: the request never got an answer;
 *  - unavailable: anything else the backend refused or failed at.
 */
export class AvailabilityError extends Error {
  constructor(message: string, readonly kind: AvailabilityErrorKind, readonly status?: number) {
    super(message);
    this.name = 'AvailabilityError';
  }
}

const PACKAGE_UNAVAILABLE_MESSAGES = /^(Tour package is not available for booking|Tour is not available for this boat|Boat not found)$/;

export async function getBookingAvailability(boatId: string, tourId: string, tourPackageId: string, date: string, signal?: AbortSignal): Promise<AvailabilitySlot[]> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  let response: Response;
  try {
    response = await fetch(`${functionsUrl}/get-booking-availability`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ boatId, tourId, tourPackageId, date }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AvailabilityError(getStoredLanguage() === 'es' ? 'No se pudo cargar la disponibilidad.' : 'Availability could not be loaded.', 'network');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const packageProblem = data?.code === 'PACKAGE_UNAVAILABLE' || ((response.status === 400 || response.status === 404) && PACKAGE_UNAVAILABLE_MESSAGES.test(String(data?.message ?? '')));
    throw new AvailabilityError(data?.message ?? (getStoredLanguage() === 'es' ? 'No se pudo cargar la disponibilidad.' : 'Availability could not be loaded.'), packageProblem ? 'package_unavailable' : 'unavailable', response.status);
  }
  return data.slots;
}
