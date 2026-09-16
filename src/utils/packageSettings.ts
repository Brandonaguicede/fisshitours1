import type { BoatTour } from '../types/boatTour';

export function parseMealOptions(value: unknown): Array<{ es: string; en: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const es = typeof row.es === 'string' ? row.es.trim() : '';
    const en = typeof row.en === 'string' ? row.en.trim() : '';
    return es || en ? [{ es: es || en, en: en || es }] : [];
  });
}

export function filterPackageSlots<T extends { id: string; time: string }>(tour: BoatTour | undefined, slots: T[]): T[] {
  if (!tour) return [];
  const allowed = new Set(tour.timeSlots.map((slot) => slot.id));
  return slots.filter((slot) => allowed.has(slot.id));
}
