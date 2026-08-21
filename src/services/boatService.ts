import { supabase } from '../lib/supabase';
import type { Boat } from '../types/boat';
import { mapBoat } from './catalogMappers';

export async function getActiveBoats(): Promise<Boat[]> {
  const { data, error } = await supabase
    .from('boats')
    .select('*')
    .eq('active', true)
    .order('sort_order');

  if (error) throw new Error(error.message);
  const mapped = (data ?? []).map(mapBoat);
  const boatIds = mapped.map((boat) => boat.id);
  if (boatIds.length === 0) return mapped;

  const db = supabase as any;
  const imagesResult = await db
    .from('boat_images')
    .select('boat_id, image_url, alt_text, is_primary, sort_order')
    .in('boat_id', boatIds)
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (imagesResult.error) return mapped;

  const imagesByBoat = new Map<string, string[]>();
  const primaryByBoat = new Map<string, string>();
  for (const image of imagesResult.data ?? []) {
    const current = imagesByBoat.get(image.boat_id) ?? [];
    current.push(image.image_url);
    imagesByBoat.set(image.boat_id, current);
    if (image.is_primary) primaryByBoat.set(image.boat_id, image.image_url);
  }

  return mapped.map((boat) => {
    const images = imagesByBoat.get(boat.id);
    if (!images?.length) return boat;
    const primary = primaryByBoat.get(boat.id) ?? images[0];
    return {
      ...boat,
      image: primary,
      images: [primary, ...images.filter((image) => image !== primary)],
    };
  });
}
