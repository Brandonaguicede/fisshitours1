import { supabase } from '../lib/supabase';
import type { BoatTour, TourTimeSlot } from '../types/boatTour';
import { mapBoatTour, type BoatTourCatalogRow } from './catalogMappers';

export async function getActiveTimeSlots(): Promise<TourTimeSlot[]> {
  const { data, error } = await supabase
    .from('time_slots')
    .select('id, label, starts_at')
    .eq('active', true)
    .order('sort_order');

  if (error) throw new Error(error.message);
  return (data ?? []).map((slot) => ({ id: slot.id, label: slot.label, time: slot.starts_at.slice(0, 5) }));
}

export async function getActiveBoatTours(): Promise<BoatTour[]> {
  const [timeSlots, packages, images, inclusions] = await Promise.all([
    getActiveTimeSlots(),
    supabase
      .from('tour_packages')
      .select('*, boat_tours!inner(id, boat_id, tour_id, active, boats!inner(active, max_guests), tours!inner(*))')
      .eq('active', true)
      .eq('boat_tours.active', true)
      .eq('boat_tours.boats.active', true)
      .eq('boat_tours.tours.active', true)
      .order('sort_order'),
    supabase.from('tour_images').select('*').eq('active', true).order('sort_order'),
    supabase.from('tour_inclusions').select('*').eq('active', true).order('sort_order'),
  ]);

  if (packages.error) throw new Error(packages.error.message);
  if (images.error) throw new Error(images.error.message);
  if (inclusions.error) throw new Error(inclusions.error.message);
  return ((packages.data ?? []) as unknown as BoatTourCatalogRow[]).map((row) => mapBoatTour(row, timeSlots, images.data ?? [], inclusions.data ?? []));
}

export async function getActivePaymentMethods() {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('key, name, description, type, logo_url, sort_order')
    .eq('active', true)
    .in('key', ['paypal', 'whatsapp-link', 'pay-on-day'])
    .order('sort_order');

  if (error) throw new Error(error.message);
  return data ?? [];
}
