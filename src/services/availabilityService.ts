import { functionsUrl, supabase } from '../lib/supabase';
import { getStoredLanguage } from '../i18n/LanguageContext';

export interface AvailabilitySlot {
  id: string;
  label: string;
  time: string;
  available: boolean;
}

export async function getBookingAvailability(boatId: string, tourId: string, tourPackageId: string, date: string, signal?: AbortSignal): Promise<AvailabilitySlot[]> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${functionsUrl}/get-booking-availability`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ boatId, tourId, tourPackageId, date }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? (getStoredLanguage() === 'es' ? 'No se pudo cargar la disponibilidad.' : 'Availability could not be loaded.'));
  return data.slots;
}
