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
  return (data ?? []).map(mapBoat);
}
