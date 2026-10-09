import { supabase } from '../lib/supabase';
import type { Boat } from '../types/boat';
import { mapBoat } from './catalogMappers';
import { orderBoatImages } from '../utils/boatImages';

export async function getActiveBoats(): Promise<Boat[]> {
  const { data, error } = await supabase
    .from('boats')
    .select('*')
    .eq('active', true)
    .order('sort_order');

  if (error) throw new Error(error.message);
  const boatRows = data ?? [];
  const boatIds = boatRows.map((boat) => boat.id);

  const db = supabase as any;
  const equipmentResult = boatIds.length
    ? await db
        .from('boat_equipment')
        .select('id, boat_id, label, label_es, label_en, sort_order, active')
        .in('boat_id', boatIds)
        .eq('active', true)
        .order('sort_order', { ascending: true })
    : { data: [], error: null };
  const equipmentRows = equipmentResult.error ? [] : (equipmentResult.data ?? []);

  const mapped = boatRows.map((row) => mapBoat(row, equipmentRows));
  if (boatIds.length === 0) return mapped;

  const imagesResult = await db
    .from('boat_images')
    .select('id, boat_id, image_url, alt_text, sort_order, created_at')
    .in('boat_id', boatIds)
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (imagesResult.error) return mapped;

  // One gallery order per boat; its first photo is the cover. Nothing else (no is_primary flag) decides which photo leads.
  const rowsByBoat = new Map<string, Array<{ id: string; image_url: string; sort_order: number; created_at: string | null }>>();
  for (const image of imagesResult.data ?? []) {
    const current = rowsByBoat.get(image.boat_id) ?? [];
    current.push(image);
    rowsByBoat.set(image.boat_id, current);
  }

  return mapped.map((boat) => {
    const images = Array.from(new Set(orderBoatImages(rowsByBoat.get(boat.id) ?? []).map((image) => image.image_url).filter(Boolean)));
    if (!images.length) return boat;
    return { ...boat, image: images[0], images };
  });
}
