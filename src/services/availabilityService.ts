import { functionsUrl, supabase } from '../lib/supabase';

export interface AvailabilitySlot {
  id: string;
  label: string;
  time: string;
  available: boolean;
}

export async function getBookingAvailability(boatId: string, date: string): Promise<AvailabilitySlot[]> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${functionsUrl}/get-booking-availability`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ boatId, date }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? 'Availability could not be loaded.');
  return data.slots;
}
